"""
Co-op API — FastAPI application with Clerk authentication and tenant-scoped
CRUD + Dashboard analytics.

Authentication model (this phase):
  * The frontend sends the Clerk **session token** as ``Authorization: Bearer``.
  * ``clerk_auth.verify_clerk_token`` validates it against Clerk's public JWKS
    (RS256) — no Clerk secret key exists in the backend.
  * Each Clerk user is auto-provisioned a ``Business`` tenant on first
    authenticated request (AFD Ch1.10 Company Setup); every query is scoped
    to that tenant via ``business_id`` (BSD Ch1.8 multi-tenant isolation).
"""

import os
import secrets
from contextlib import asynccontextmanager
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, EmailStr, Field

from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import case, func, or_, select, text
from sqlalchemy import update as sa_update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.concurrency import run_in_threadpool

from . import briefing as briefing_mod
from . import importer
from . import audit as audit_mod
from . import backups as backups_mod
from .ai import service as ai_service
from .ai import forecast as ai_forecast_mod
from .ai import history as ai_history_mod
from .ai import prompts as ai_prompts_mod
from .ai.ratelimit import SlidingWindowRateLimiter, enforce_ai_rate_limit
from .ratelimits import enforce_export_rate_limit, enforce_import_rate_limit
from .exports import export_report, ExportError
from .notifications import build_daily_summary
from .notifications import delivery as delivery_mod
from .notifications.schemas import DailySummary as DailySummarySchema
from .reports import FilterError, ReportFilters, REPORT_TITLES, build_report
from .sync import ALLOWED_ORDER_TRANSITIONS, apply_push
from .pull import build_pull_payload
from .clerk_auth import ClerkUser, get_frontend_api, verify_clerk_token
from .config import get_env, load_config
from . import team as team_mod
from .database import dispose_db, get_db, init_db
from .models import (
    Business,
    BusinessInvitation,
    BusinessMember,
    Customer,
    License,
    Order,
    OrderItem,
    Product,
    StockMovement,
    StockMovementReason,
)
from .schemas import (
    ALLOWED_CURRENCIES,
    ALLOWED_TIMEZONES,
    AdjustStockRequest,
    AuditEntryOut,
    AuthMeResponse,
    BusinessSettingsOut,
    BusinessSettingsUpdate,
    CategoryValue,
    CustomerCreate,
    CustomerListResponse,
    CustomerOut,
    CustomerUpdate,
    DashboardSummary,
    GrowthResponse,
    InventorySummary,
    MovementListResponse,
    OrderCreate,
    OrderListResponse,
    OrderOut,
    OrderUpdate,
    ProductCreate,
    ProductListResponse,
    ProductOut,
    ProductUpdate,
    RevenueMonthResponse,
    RevenueTodayResponse,
    TimeseriesPoint,
    TopProductItem,
    TeamInviteAccept,
    TeamInviteCreate,
    TeamInviteOut,
    TeamMemberOut,
    TeamResponse,
    TeamRoleUpdate,
)

# ---------------------------------------------------------------------------
# FastAPI Application
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Fail fast in production when Clerk is not configured (Task 11 / audit
    # H5): get_frontend_api raises unless CLERK_FRONTEND_API is set there.
    get_frontend_api()
    # Additive dev bootstrap: CREATE TABLE IF NOT EXISTS via the ORM. Alembic
    # migrations (backend/alembic) are the real migration path; this never
    # alters existing tables.
    await init_db()
    yield
    await dispose_db()


app = FastAPI(
    title="Co-op",
    openapi_url="/docs/openapi.json",
    docs_url="/docs",
    lifespan=lifespan,
)

# CORS: Bearer-token auth (no cookies), so '*' without credentials is a safe
# DEV default. Production refuses to start with an open CORS policy: set
# CORS_ORIGINS (comma-separated) or config/production.json cors.origins —
# neither present means a RuntimeError at startup (hardening backlog item).
def cors_allowlist() -> list[str]:
    """Resolve the CORS origin allow-list for the active environment."""
    raw = os.getenv("CORS_ORIGINS")
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    if get_env() == "production":
        origins = [
            o
            for o in (load_config().get("cors", {}) or {}).get("origins", [])
            if o
        ]
        if not origins:
            raise RuntimeError(
                "CORS_ORIGINS is not set and production config has no "
                "cors.origins. Refusing to start with an open CORS policy "
                "in production."
            )
        return origins
    return ["*"]


app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allowlist(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Defence-in-depth HTTP hardening (checklist 148-155).
#
# Auth is a Bearer token, not a cookie, so the browser never holds a session
# that a third-party page could ride on — but the headers below remove whole
# classes of browser-side attacks anyway and cost nothing.
# ---------------------------------------------------------------------------
@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), geolocation=(), microphone=()")
    # The API is never rendered as a page; a strict CSP is safe here and
    # stops any accidental HTML/JS from executing if an error page leaks.
    response.headers.setdefault(
        "Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'"
    )
    # HSTS only makes sense over HTTPS in production; adding it in dev would
    # make local browsers refuse plain-http localhost afterwards.
    if get_env() == "production":
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
        )
    return response


@app.exception_handler(Exception)
async def _unhandled_error_handler(request, exc):
    """Never let a traceback or an internal detail reach a client (149).

    HTTPException keeps its own (already-sanitised) detail; anything else is
    a bug, and the client gets a generic 500 while the real error goes to the
    server log.
    """
    import logging
    import traceback

    from .redact import scrub_text

    logging.getLogger("coop").error(
        "Unhandled error on %s %s\n%s",
        request.method, request.url.path, scrub_text(traceback.format_exc()),
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error."},
    )

# Order statuses that count toward revenue/profit (not pending/cancelled).
_ACTIVE_STATUSES = ["shipped", "delivered"]

# Daily-summary email: 3 sends per 15 minutes per business. The summary is
# one identical message; this only stops accidental spam/refresh loops.
_SUMMARY_EMAIL_LIMITER = SlidingWindowRateLimiter(requests=3, window_seconds=900)


# ---------------------------------------------------------------------------
# Shared "low stock" definition (Task 12 / M9).
#
# ONE definition used by every dashboard/inventory surface, mutually exclusive
# with out-of-stock so a product is never double-counted:
#   low = in stock (current_stock > 0) but at/below the reorder level
#   out = current_stock == 0
# ---------------------------------------------------------------------------
def _strictly_low_stock_case():
    return case(
        (Product.current_stock == 0, 0),
        (Product.current_stock <= Product.reorder_level, 1),
        else_=0,
    )


def _out_of_stock_case():
    return case((Product.current_stock == 0, 1), else_=0)


# ---------------------------------------------------------------------------
# Tenant dependency — Clerk user -> auto-provisioned Business
# ---------------------------------------------------------------------------

async def get_current_business(
    request: Request,
    user: ClerkUser = Depends(verify_clerk_token),
    db: AsyncSession = Depends(get_db),
) -> Business:
    """Resolve the caller's business and role (TRD Ch17 §17.7).

    Owners match on owner_id (auto-provisioned on first use). Non-owners
    resolve through their team membership. The resolved role is stored on
    request.state and every mutation is checked against the role matrix
    here — the single choke point all business endpoints pass through.
    """
    stmt = select(Business).where(
        Business.owner_id == user.user_id,
        Business.deleted_at.is_(None),
    ).order_by(Business.id).limit(1)
    business = (await db.execute(stmt)).scalars().first()

    role = "owner"
    if business is None:
        member = (
            await db.execute(
                select(BusinessMember)
                .where(BusinessMember.user_id == user.user_id)
                .order_by(BusinessMember.id)
                .limit(1)
            )
        ).scalars().first()
        if member is not None:
            business = (
                await db.execute(
                    select(Business).where(
                        Business.id == member.business_id,
                        Business.deleted_at.is_(None),
                    )
                )
            ).scalars().first()
            if business is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Your team's business no longer exists",
                )
            role = member.role
        else:
            if user.email:
                pending = (
                    await db.execute(
                        select(BusinessInvitation)
                        .where(
                            BusinessInvitation.email == user.email.lower(),
                            BusinessInvitation.status == "pending",
                        )
                        .limit(1)
                    )
                ).scalars().first()
                if pending is not None:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="You have a pending team invitation — accept it first",
                    )
            business = Business(
                name="My Business",
                owner_id=user.user_id,
                currency="USD",
                created_by=user.user_id,
            )
            db.add(business)
            await db.flush()

    request.state.team_role = role
    request.state.is_owner = role == "owner"
    team_mod.assert_can_write(role, request.method, request.url.path)

    # Database-side tenant backstop (Supabase RLS): carry the tenant in the
    # app.business_id GUC for this transaction. No-op on SQLite; the owner
    # bypasses RLS anyway, so this only constrains future non-owner roles.
    from .rls import set_tenant_context

    await set_tenant_context(db, business.id)
    return business


def _scoped(model):
    """Base filter: only live rows belonging to the caller's tenant."""
    return [model.business_id == Business.id, model.deleted_at.is_(None)]


# ---------------------------------------------------------------------------
# Health / Root (public)
# ---------------------------------------------------------------------------

@app.get("/healthcheck", tags=["Health"])
async def healthcheck(db: AsyncSession = Depends(get_db)) -> dict:
    """Liveness + database readiness (Task 12 polish).

    Returns 200 when the API and its database are reachable, 503 otherwise.
    """
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(status_code=503, detail="database unavailable")
    return {"status": "healthy", "database": "up"}


@app.get("/", tags=["Root"])
async def read_root() -> dict:
    return {"message": "Welcome to Co-op API"}


# ---------------------------------------------------------------------------
# Authentication info
# ---------------------------------------------------------------------------

@app.get("/auth/me", response_model=AuthMeResponse, tags=["Authentication"])
async def auth_me(
    user: ClerkUser = Depends(verify_clerk_token),
    db: AsyncSession = Depends(get_db),
) -> AuthMeResponse:
    """Identity + tenant for the signed-in user (Clerk-verified).

    Resolution order: owned business -> team membership -> pending
    invitation (the invitee must accept before a business is provisioned).
    A brand-new owner gets the auto-provisioned "My Business".
    """
    business = (
        await db.execute(
            select(Business)
            .where(Business.owner_id == user.user_id, Business.deleted_at.is_(None))
            .order_by(Business.id)
            .limit(1)
        )
    ).scalars().first()

    if business is not None:
        return AuthMeResponse(
            user_id=user.user_id,
            business_id=business.id,
            business_name=business.name,
            currency=business.currency or "USD",
            role="owner",
            email=user.email,
        )

    member = (
        await db.execute(
            select(BusinessMember)
            .where(BusinessMember.user_id == user.user_id)
            .order_by(BusinessMember.id)
            .limit(1)
        )
    ).scalars().first()
    if member is not None:
        team_business = (
            await db.execute(
                select(Business).where(
                    Business.id == member.business_id, Business.deleted_at.is_(None)
                )
            )
        ).scalars().first()
        if team_business is not None:
            return AuthMeResponse(
                user_id=user.user_id,
                business_id=team_business.id,
                business_name=team_business.name,
                currency=team_business.currency or "USD",
                role=member.role,
                email=member.email or user.email,
            )

    if user.email:
        invite = (
            await db.execute(
                select(BusinessInvitation)
                .where(
                    BusinessInvitation.email == user.email.lower(),
                    BusinessInvitation.status == "pending",
                )
                .order_by(BusinessInvitation.id.desc())
                .limit(1)
            )
        ).scalars().first()
        if invite is not None:
            invite_business = (
                await db.execute(
                    select(Business).where(
                        Business.id == invite.business_id, Business.deleted_at.is_(None)
                    )
                )
            ).scalars().first()
            return AuthMeResponse(
                user_id=user.user_id,
                business_id=None,
                business_name=invite_business.name if invite_business else "",
                currency="USD",
                role="viewer",
                email=user.email,
                pending_invitation=TeamInviteOut(
                    token=invite.token,
                    email=invite.email,
                    role=invite.role,
                    status=invite.status,
                    business_name=invite_business.name if invite_business else "",
                    created_at=invite.created_at,
                ),
            )

    # Brand-new owner: auto-provision on first contact.
    business = Business(
        name="My Business",
        owner_id=user.user_id,
        currency="USD",
        created_by=user.user_id,
    )
    db.add(business)
    await db.flush()
    return AuthMeResponse(
        user_id=user.user_id,
        business_id=business.id,
        business_name=business.name,
        currency="USD",
        role="owner",
        email=user.email,
    )


# ---------------------------------------------------------------------------
# Team (TRD Ch17 §17.7) — memberships, roles, invitations
# ---------------------------------------------------------------------------

def _invite_out(invite, business_name: str) -> TeamInviteOut:
    return TeamInviteOut(
        token=invite.token,
        email=invite.email,
        role=invite.role,
        status=invite.status,
        business_name=business_name,
        created_at=invite.created_at,
    )


@app.get("/team", response_model=TeamResponse, tags=["Team"])
async def get_team(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> TeamResponse:
    """Members + invitations for the tenant. Any member may read the roster;
    management endpoints below are owner-only."""
    members = (
        (
            await db.execute(
                select(BusinessMember)
                .where(BusinessMember.business_id == business.id)
                .order_by(BusinessMember.id)
            )
        )
        .scalars()
        .all()
    )
    invites = (
        (
            await db.execute(
                select(BusinessInvitation)
                .where(BusinessInvitation.business_id == business.id)
                .order_by(BusinessInvitation.id.desc())
            )
        )
        .scalars()
        .all()
    )
    return TeamResponse(
        members=[
            TeamMemberOut(
                user_id=m.user_id,
                email=m.email,
                role=m.role,
                joined_at=m.created_at,
            )
            for m in members
        ],
        invitations=[_invite_out(i, business.name) for i in invites],
    )


@app.post(
    "/team/invites",
    response_model=TeamInviteOut,
    status_code=status.HTTP_201_CREATED,
    tags=["Team"],
)
async def create_team_invite(
    payload: TeamInviteCreate,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
    user: ClerkUser = Depends(verify_clerk_token),
    _owner: str = Depends(team_mod.require_owner),
) -> TeamInviteOut:
    """Owner invites someone by email with one of the five future roles."""
    email = payload.email.lower()
    if business.owner_email and business.owner_email.lower() == email:
        raise HTTPException(status_code=400, detail="That is the owner's email")
    existing_member = (
        await db.execute(
            select(BusinessMember).where(
                BusinessMember.business_id == business.id,
                BusinessMember.email == email,
            )
        )
    ).scalars().first()
    if existing_member is not None:
        raise HTTPException(status_code=400, detail="That person is already a member")

    token = secrets.token_urlsafe(24)
    invite = BusinessInvitation(
        business_id=business.id,
        email=email,
        role=payload.role,
        token=token,
        status="pending",
        created_by=user.user_id,
    )
    db.add(invite)
    await db.flush()
    await audit_mod.record_audit(
        db,
        business.id,
        "team",
        invite.id,
        "INVITE",
        {"email": email, "role": payload.role},
        actor=user.user_id,
    )
    return _invite_out(invite, business.name)


@app.post("/team/invites/accept", response_model=TeamMemberOut, tags=["Team"])
async def accept_team_invite(
    payload: TeamInviteAccept,
    user: ClerkUser = Depends(verify_clerk_token),
    db: AsyncSession = Depends(get_db),
) -> TeamMemberOut:
    """The invited person claims the invite. Deliberately independent of
    get_current_business: the invitee has no business yet."""
    invite = (
        await db.execute(
            select(BusinessInvitation).where(BusinessInvitation.token == payload.token)
        )
    ).scalars().first()
    if invite is None or invite.status != "pending":
        raise HTTPException(status_code=400, detail="Invitation not found or no longer pending")
    if user.email and invite.email != user.email.lower():
        raise HTTPException(
            status_code=403, detail="This invitation was sent to a different email"
        )

    business = (
        await db.execute(
            select(Business).where(
                Business.id == invite.business_id, Business.deleted_at.is_(None)
            )
        )
    ).scalars().first()
    if business is None:
        raise HTTPException(status_code=404, detail="The inviting business no longer exists")

    member = (
        await db.execute(
            select(BusinessMember).where(
                BusinessMember.business_id == invite.business_id,
                BusinessMember.user_id == user.user_id,
            )
        )
    ).scalars().first()
    if member is None:
        member = BusinessMember(
            business_id=invite.business_id,
            user_id=user.user_id,
            email=invite.email,
            role=invite.role,
            invited_by=invite.created_by,
        )
        db.add(member)
        await db.flush()

    invite.status = "accepted"
    invite.accepted_by = user.user_id
    await audit_mod.record_audit(
        db,
        invite.business_id,
        "team",
        invite.id,
        "INVITE_ACCEPT",
        {"email": invite.email, "role": invite.role},
        actor=user.user_id,
    )
    return TeamMemberOut(
        user_id=member.user_id,
        email=member.email,
        role=member.role,
        joined_at=member.created_at,
    )


@app.delete("/team/invites/{token}", tags=["Team"])
async def revoke_team_invite(
    token: str,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
    user: ClerkUser = Depends(verify_clerk_token),
    _owner: str = Depends(team_mod.require_owner),
) -> dict:
    invite = (
        await db.execute(
            select(BusinessInvitation).where(
                BusinessInvitation.token == token,
                BusinessInvitation.business_id == business.id,
            )
        )
    ).scalars().first()
    if invite is None:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invite.status == "pending":
        invite.status = "revoked"
        await audit_mod.record_audit(
            db,
            business.id,
            "team",
            invite.id,
            "INVITE_REVOKE",
            {"email": invite.email},
            actor=user.user_id,
        )
    return {"ok": True}


@app.patch("/team/members/{member_user_id}", response_model=TeamMemberOut, tags=["Team"])
async def update_team_member_role(
    member_user_id: str,
    payload: TeamRoleUpdate,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
    user: ClerkUser = Depends(verify_clerk_token),
    _owner: str = Depends(team_mod.require_owner),
) -> TeamMemberOut:
    member = (
        await db.execute(
            select(BusinessMember).where(
                BusinessMember.business_id == business.id,
                BusinessMember.user_id == member_user_id,
            )
        )
    ).scalars().first()
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    member.role = payload.role
    await audit_mod.record_audit(
        db,
        business.id,
        "team",
        member.id,
        "MEMBER_ROLE",
        {"user_id": member.user_id, "role": payload.role},
        actor=user.user_id,
    )
    return TeamMemberOut(
        user_id=member.user_id,
        email=member.email,
        role=member.role,
        joined_at=member.created_at,
    )


@app.delete("/team/members/{member_user_id}", tags=["Team"])
async def remove_team_member(
    member_user_id: str,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
    user: ClerkUser = Depends(verify_clerk_token),
    _owner: str = Depends(team_mod.require_owner),
) -> dict:
    member = (
        await db.execute(
            select(BusinessMember).where(
                BusinessMember.business_id == business.id,
                BusinessMember.user_id == member_user_id,
            )
        )
    ).scalars().first()
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    await db.delete(member)
    await audit_mod.record_audit(
        db,
        business.id,
        "team",
        member.id,
        "MEMBER_REMOVE",
        {"user_id": member.user_id, "role": member.role},
        actor=user.user_id,
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Settings — Company Settings (tenant-scoped, Task 9, UXDS 15.6)
# ---------------------------------------------------------------------------

@app.get("/business/settings", response_model=BusinessSettingsOut, tags=["Settings"])
async def get_business_settings(
    business: Business = Depends(get_current_business),
) -> Business:
    """Company settings for the caller's tenant (auto-provisioned)."""
    return business


@app.patch("/business/settings", response_model=BusinessSettingsOut, tags=["Settings"])
async def update_business_settings(
    updates: BusinessSettingsUpdate,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> Business:
    """Update whitelisted company settings. Identity fields are immutable."""
    data = updates.model_dump(exclude_unset=True)

    # Explicit enum validation beyond Pydantic length checks.
    if "currency" in data and data["currency"] is not None:
        code = data["currency"].upper()
        if code not in ALLOWED_CURRENCIES:
            raise HTTPException(
                status_code=422,
                detail=f"Unsupported currency '{data['currency']}'. "
                       f"Allowed: {', '.join(sorted(ALLOWED_CURRENCIES))}",
            )
        data["currency"] = code
    if "timezone" in data and data["timezone"] is not None:
        if data["timezone"] not in ALLOWED_TIMEZONES:
            raise HTTPException(
                status_code=422,
                detail=f"Unsupported timezone '{data['timezone']}'.",
            )
    if "ai_response_style" in data and data["ai_response_style"] is not None:
        style = data["ai_response_style"]
        if style not in ai_prompts_mod.ALLOWED_AI_RESPONSE_STYLES:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Unsupported AI response style '{style}'. "
                    f"Allowed: {', '.join(ai_prompts_mod.ALLOWED_AI_RESPONSE_STYLES)}"
                ),
            )

    # Only schema-whitelisted fields can ever be set here (owner_id, id,
    # timestamps, version are not part of BusinessSettingsUpdate).
    for field, value in data.items():
        setattr(business, field, value)
    business.updated_by = business.owner_id

    await db.flush()
    await db.refresh(business)
    await audit_mod.record_audit(
        db, business.id, "businesses", business.id, "update",
        change=data, actor=business.owner_id,
    )
    return business


# ---------------------------------------------------------------------------
# Audit log (hardening backlog) — append-only trail of every mutation in the
# tenant, written by the same transaction as the mutation it describes.
# ---------------------------------------------------------------------------

@app.get("/audit", response_model=List[AuditEntryOut], tags=["Audit"])
async def audit_entries(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> List[AuditEntryOut]:
    """The caller's activity log, newest first (tenant-scoped)."""
    rows = await audit_mod.list_entries(db, business.id, limit=limit, offset=offset)
    return [AuditEntryOut.model_validate(r) for r in rows]


# ---------------------------------------------------------------------------
# Backup & Restore (PRD Phase 4 "Backup system").
#
# Export downloads a JSON snapshot of the tenant's business data; restore
# uploads one and is allowed ONLY into an empty business (never a merge).
# ---------------------------------------------------------------------------

@app.get("/backups/export", tags=["Backup"])
async def backups_export(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Download the tenant's business data as a Co-op backup file."""
    payload = backups_mod.encrypt_backup(await backups_mod.build_backup(db, business))
    stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    return JSONResponse(
        content=payload,
        headers={
            "Content-Disposition": f'attachment; filename="coop-backup-{stamp}.json"'
        },
    )


@app.post("/backups/restore", tags=["Backup"])
async def backups_restore(
    payload: Dict[str, Any],
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Restore a Co-op backup into an EMPTY business (409 otherwise)."""
    try:
        payload = backups_mod.decrypt_backup(payload)
        result = await backups_mod.restore_backup(db, business, payload)
    except backups_mod.RestoreRefused as e:
        raise HTTPException(status_code=409, detail=str(e))
    except backups_mod.BackupValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await audit_mod.record_audit(
        db, business.id, "businesses", business.id, "restore",
        change={"restored": result["restored"]}, actor=business.owner_id,
    )
    return result


# ---------------------------------------------------------------------------
# Products CRUD (tenant-scoped)
# ---------------------------------------------------------------------------

def _log_movement(
    db: AsyncSession,
    business_id: int,
    product_id: int,
    change: int,
    reason: StockMovementReason,
    actor: Optional[str],
    note: Optional[str] = None,
    order_id: Optional[int] = None,
) -> None:
    """Append one immutable row to the stock ledger (Task 8)."""
    db.add(
        StockMovement(
            business_id=business_id,
            product_id=product_id,
            change=change,
            reason=reason,
            note=note,
            order_id=order_id,
            actor=actor,
        )
    )


async def _change_stock(
    db: AsyncSession,
    business_id: int,
    product: Product,
    delta: int,
    reason: StockMovementReason,
    actor: Optional[str],
    note: Optional[str] = None,
    order_id: Optional[int] = None,
) -> None:
    """Apply a signed stock change under the optimistic-lock guard.

    This is the SINGLE choke point for every stock mutation (Task 11 / audit
    H1): manual adjustments, order creation (deduct), cancellation and
    deletion (restore). The version-guarded UPDATE means a caller holding a
    stale ``product.version`` (a concurrent writer already changed the row)
    matches 0 rows and aborts with 409, so no write is ever lost and stock can
    never be double-deducted or double-restored.
    """
    if delta == 0:
        raise HTTPException(status_code=422, detail="Stock change must be non-zero")

    current = product.current_stock or 0
    new_level = current + delta
    if new_level < 0:
        raise HTTPException(
            status_code=409,
            detail=f"Insufficient stock: {current} available, {-delta} requested",
        )

    result = await db.execute(
        sa_update(Product)
        .where(Product.id == product.id, Product.version == product.version)
        .values(
            current_stock=new_level,
            version=product.version + 1,
            updated_by=actor,
        )
        .execution_options(synchronize_session=False)
    )
    if result.rowcount == 0:
        raise HTTPException(
            status_code=409, detail="Stock changed concurrently — please retry"
        )

    # Keep the in-session object consistent with the row we just wrote.
    product.current_stock = new_level
    product.version = product.version + 1
    product.updated_by = actor

    _log_movement(
        db, business_id, product.id, delta, reason, actor,
        note=note, order_id=order_id,
    )


@app.post(
    "/products",
    response_model=ProductOut,
    status_code=status.HTTP_201_CREATED,
    tags=["Products"],
)
async def create_product(
    product: ProductCreate,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> ProductOut:
    # Duplicate check: live rows only — a soft-deleted product's SKU is
    # reusable (Task 10). The partial unique index enforces the same rule
    # at the database level.
    stmt = select(Product).where(
        Product.sku == product.sku,
        Product.business_id == business.id,
        Product.deleted_at.is_(None),
    )
    if (await db.execute(stmt)).scalars().first():
        raise HTTPException(status_code=409, detail="SKU already exists")

    new_product = Product(
        **product.model_dump(),
        business_id=business.id,
        created_by=business.owner_id,
    )
    db.add(new_product)
    try:
        await db.flush()
    except IntegrityError:
        # Safety net: any uniqueness collision (e.g. race) surfaces as a
        # clean 409 instead of an unhandled 500 (Task 10 / audit fix B-1).
        raise HTTPException(status_code=409, detail="SKU already exists")
    # Initial stock (if any) is the first ledger entry (UXDS 11.9).
    if new_product.current_stock:
        _log_movement(
            db, business.id, new_product.id, new_product.current_stock,
            StockMovementReason.initial, business.owner_id,
        )
    await db.refresh(new_product)
    await audit_mod.record_audit(
        db, business.id, "products", new_product.id, "create",
        change={"sku": new_product.sku, "name": new_product.name},
        actor=business.owner_id,
    )
    return new_product


@app.get("/products", response_model=ProductListResponse, tags=["Products"])
async def list_products(
    search: Optional[str] = Query(None, min_length=1),
    low_stock: bool = Query(
        False, description="Only products in stock but at/below their reorder level"
    ),
    stock: Optional[str] = Query(
        None, description="Stock status filter: in | low | out (Task 8)"
    ),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> ProductListResponse:
    """Paginated, searchable product listing (Task 5 envelope)."""
    base = select(Product).where(Product.business_id == business.id, Product.deleted_at.is_(None))
    if low_stock:
        # Shared definition: strictly low (in stock but at/below reorder).
        base = base.where(Product.current_stock > 0, Product.current_stock <= Product.reorder_level)
    if stock is not None:
        if stock not in {"in", "low", "out"}:
            raise HTTPException(status_code=422, detail="stock must be one of: in, low, out")
        if stock == "out":
            base = base.where(Product.current_stock == 0)
        elif stock == "low":
            base = base.where(
                Product.current_stock > 0,
                Product.current_stock <= Product.reorder_level,
            )
        else:  # "in"
            base = base.where(Product.current_stock > Product.reorder_level)
    if search:
        like = f"%{search.lower()}%"
        base = base.where(
            or_(Product.name.ilike(like), Product.sku.ilike(like), Product.category.ilike(like))
        )

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (await db.execute(
        base.order_by(Product.id.desc()).offset((page - 1) * limit).limit(limit)
    )).scalars().all()

    return ProductListResponse(items=rows, total=total, page=page, limit=limit)


@app.get("/products/{id}", response_model=ProductOut, tags=["Products"])
async def get_product(
    id: int,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> ProductOut:
    stmt = select(Product).where(
        Product.id == id, Product.business_id == business.id, Product.deleted_at.is_(None)
    )
    product = (await db.execute(stmt)).scalars().first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@app.put("/products/{id}", response_model=ProductOut, tags=["Products"])
async def update_product(
    id: int,
    updates: ProductUpdate,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> ProductOut:
    product = await get_product(id, business, db)
    for field, value in updates.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    product.updated_by = business.owner_id
    await db.flush()
    await db.refresh(product)
    await audit_mod.record_audit(
        db, business.id, "products", product.id, "update",
        change=updates.model_dump(exclude_unset=True), actor=business.owner_id,
    )
    return product


@app.delete("/products/{id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Products"])
async def delete_product(
    id: int,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> None:
    product = await get_product(id, business, db)
    # Soft delete (BSD Ch1.17 / Ch2.12).
    product.deleted_at = datetime.utcnow()
    product.deleted_by = business.owner_id
    await db.flush()
    await audit_mod.record_audit(
        db, business.id, "products", product.id, "delete", actor=business.owner_id,
    )


# ---------------------------------------------------------------------------
# Inventory (tenant-scoped) — Task 8: stock adjustments, movement ledger,
# module summary. After creation, stock changes ONLY through /adjust here.
# ---------------------------------------------------------------------------

@app.post("/products/{id}/adjust", response_model=ProductOut, tags=["Inventory"])
async def adjust_stock(
    id: int,
    req: AdjustStockRequest,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> ProductOut:
    """Apply a signed stock adjustment and log it to the ledger (UXDS 11.11)."""
    if req.change == 0:
        raise HTTPException(status_code=422, detail="Adjustment change must be non-zero")

    product = await get_product(id, business, db)
    await _change_stock(
        db, business.id, product, req.change,
        StockMovementReason(req.reason.value), business.owner_id, note=req.note,
    )
    await db.flush()
    await db.refresh(product)
    await audit_mod.record_audit(
        db, business.id, "products", product.id, "adjust",
        change={"change": req.change, "reason": req.reason.value, "note": req.note},
        actor=business.owner_id,
    )
    return product


@app.get("/products/{id}/movements", response_model=MovementListResponse, tags=["Inventory"])
async def list_movements(
    id: int,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> MovementListResponse:
    """Immutable stock-movement ledger for one product, newest first (UXDS 11.12)."""
    await get_product(id, business, db)  # 404 for unknown/cross-tenant products
    base = select(StockMovement).where(
        StockMovement.business_id == business.id, StockMovement.product_id == id
    )
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (await db.execute(
        base.order_by(StockMovement.id.desc()).offset((page - 1) * limit).limit(limit)
    )).scalars().all()
    return MovementListResponse(items=rows, total=total, page=page, limit=limit)


@app.get("/inventory/summary", response_model=InventorySummary, tags=["Inventory"])
async def inventory_summary(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> InventorySummary:
    """Inventory KPI row (UXDS 11.5): products, value, low, out, categories."""
    scope = [Product.business_id == business.id, Product.deleted_at.is_(None)]
    row = (await db.execute(
        select(
            func.count(Product.id),
            func.coalesce(
                func.sum(
                    Product.current_stock * func.coalesce(Product.cost_price, Product.unit_price)
                ),
                0.0,
            ),
            func.coalesce(func.sum(_strictly_low_stock_case()), 0),
            func.coalesce(func.sum(_out_of_stock_case()), 0),
        ).where(*scope)
    )).one()
    categories = (await db.execute(
        select(func.count(func.distinct(Product.category))).where(
            *scope, Product.category.is_not(None)
        )
    )).scalar() or 0
    return InventorySummary(
        products_count=row[0],
        inventory_value=row[1],
        low_stock_count=row[2],
        out_of_stock_count=row[3],
        categories_count=categories,
    )


# ---------------------------------------------------------------------------
# Customers CRUD (tenant-scoped)
# ---------------------------------------------------------------------------

@app.post(
    "/customers",
    response_model=CustomerOut,
    status_code=status.HTTP_201_CREATED,
    tags=["Customers"],
)
async def create_customer(
    customer: CustomerCreate,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> CustomerOut:
    # Duplicate guard covers LIVE rows only (Task 11 / audit H2): a
    # soft-deleted customer's email is reusable, matching the partial unique
    # index on (business_id, email) WHERE deleted_at IS NULL.
    stmt = select(Customer).where(
        Customer.email == customer.email,
        Customer.business_id == business.id,
        Customer.deleted_at.is_(None),
    )
    if (await db.execute(stmt)).scalars().first():
        raise HTTPException(status_code=409, detail="Email already exists")

    new_customer = Customer(
        **customer.model_dump(),
        business_id=business.id,
        created_by=business.owner_id,
    )
    db.add(new_customer)
    await db.flush()
    await db.refresh(new_customer)
    await audit_mod.record_audit(
        db, business.id, "customers", new_customer.id, "create",
        change={"email": new_customer.email, "full_name": new_customer.full_name},
        actor=business.owner_id,
    )
    return new_customer


@app.get("/customers", response_model=CustomerListResponse, tags=["Customers"])
async def list_customers(
    search: Optional[str] = Query(None, min_length=1),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> CustomerListResponse:
    """Paginated, searchable customer listing (Task 6 envelope)."""
    base = select(Customer).where(
        Customer.business_id == business.id, Customer.deleted_at.is_(None)
    )
    if search:
        like = f"%{search.lower()}%"
        base = base.where(
            or_(
                Customer.full_name.ilike(like),
                Customer.email.ilike(like),
                Customer.company.ilike(like),
            )
        )

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (await db.execute(
        base.order_by(Customer.id.desc()).offset((page - 1) * limit).limit(limit)
    )).scalars().all()

    return CustomerListResponse(items=rows, total=total, page=page, limit=limit)


@app.get("/customers/{id}", response_model=CustomerOut, tags=["Customers"])
async def get_customer(
    id: int,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> CustomerOut:
    stmt = select(Customer).where(
        Customer.id == id, Customer.business_id == business.id, Customer.deleted_at.is_(None)
    )
    customer = (await db.execute(stmt)).scalars().first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@app.put("/customers/{id}", response_model=CustomerOut, tags=["Customers"])
async def update_customer(
    id: int,
    updates: CustomerUpdate,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> CustomerOut:
    customer = await get_customer(id, business, db)

    # Per-tenant email duplicate guard (excluding the record being updated).
    if updates.email is not None and updates.email != customer.email:
        stmt = select(Customer).where(
            Customer.business_id == business.id,
            Customer.email == updates.email,
            Customer.id != id,
            Customer.deleted_at.is_(None),
        )
        if (await db.execute(stmt)).scalars().first():
            raise HTTPException(status_code=409, detail="Email already exists")

    for field, value in updates.model_dump(exclude_unset=True).items():
        setattr(customer, field, value)
    customer.updated_by = business.owner_id
    await db.flush()
    await db.refresh(customer)
    await audit_mod.record_audit(
        db, business.id, "customers", customer.id, "update",
        change=updates.model_dump(exclude_unset=True), actor=business.owner_id,
    )
    return customer


@app.delete("/customers/{id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Customers"])
async def delete_customer(
    id: int,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> None:
    customer = await get_customer(id, business, db)
    customer.deleted_at = datetime.utcnow()
    customer.deleted_by = business.owner_id
    await db.flush()
    await audit_mod.record_audit(
        db, business.id, "customers", customer.id, "delete", actor=business.owner_id,
    )


# ---------------------------------------------------------------------------
# Orders (tenant-scoped) — Task 7: transactional stock handling,
# guarded status transitions, pagination envelope.
#
# Inventory policy:
#   * Stock is deducted exactly once, at order creation, after ALL items
#     validate. Any failure raises before the order is added, and get_db's
#     request-scoped rollback guarantees inventory is left unchanged.
#   * Stock is restored exactly once — on cancellation, or on deletion of an
#     order that was not already cancelled.
#   * Prices are snapshots: the submitted unit_price is stored as-is.
# ---------------------------------------------------------------------------

# Legal status transitions (MVP): shipped cannot be cancelled; delivered and
# cancelled are terminal.
async def _load_order(id: int, business: Business, db: AsyncSession) -> Order:
    """Tenant-scoped ORM fetch with relationships; 404 when absent."""
    stmt = (
        select(Order)
        .options(
            selectinload(Order.customer),
            selectinload(Order.items).selectinload(OrderItem.product),
        )
        .where(Order.id == id, Order.business_id == business.id, Order.deleted_at.is_(None))
    )
    order = (await db.execute(stmt)).scalars().first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


def _serialize_order(order: Order) -> OrderOut:
    from .schemas import (
        OrderItemOut,
        OrderStatus as SchemaOrderStatus  # local import: avoids cycle at module load,
    )

    current = order.status.value if hasattr(order.status, "value") else str(order.status)
    allowed = [
        SchemaOrderStatus(s)
        for s in sorted(ALLOWED_ORDER_TRANSITIONS.get(current, set()))
    ]

    return OrderOut(
        id=order.id,
        customer_id=order.customer_id,
        customer=order.customer,
        status=order.status,
        allowed_transitions=allowed,
        total_amount=order.total_amount,
        order_date=order.order_date,
        created_at=order.created_at,
        items=[
            OrderItemOut(
                id=item.id,
                product_id=item.product_id,
                product_name=item.product.name if item.product is not None else None,
                quantity=item.quantity,
                unit_price=item.unit_price,
                total_price=item.total_price,
            )
            for item in order.items
        ],
    )


async def _restore_stock(
    db: AsyncSession, order: Order, actor: Optional[str], reason: StockMovementReason
) -> None:
    """Return each line's quantity to its product's stock and log it.

    Goes through ``_change_stock`` so restoration is subject to the same
    optimistic-lock guard as deduction — no lost or duplicated restores.
    """
    for item in order.items:
        if item.product is not None:
            await _change_stock(
                db, order.business_id, item.product, item.quantity,
                reason, actor, order_id=order.id,
            )


@app.post("/orders", response_model=OrderOut, status_code=status.HTTP_201_CREATED, tags=["Orders"])
async def create_order(
    order: OrderCreate,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> OrderOut:
    customer = await get_customer(order.customer_id, business, db)

    # ---- Validation phase (SELECTs only; nothing written yet) -------------
    seen_product_ids: set[int] = set()
    lines: list[tuple[Product, type(order.items[0])]] = []
    for item in order.items:
        if item.product_id in seen_product_ids:
            raise HTTPException(
                status_code=422,
                detail=f"Duplicate order line for product id {item.product_id}",
            )
        seen_product_ids.add(item.product_id)
        product = await get_product(item.product_id, business, db)  # 404 cross-tenant
        if (product.current_stock or 0) < item.quantity:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Insufficient stock for '{product.name}': "
                    f"{product.current_stock or 0} available, {item.quantity} requested"
                ),
            )
        lines.append((product, item))

    # ---- Application phase (single request transaction; rollback-safe) ----
    total = 0.0
    item_models: List[OrderItem] = []
    for product, item in lines:
        line_total = round(item.unit_price * item.quantity, 2)
        total += line_total
        item_models.append(
            OrderItem(
                business_id=business.id,
                product_id=product.id,
                quantity=item.quantity,
                unit_price=item.unit_price,  # snapshot price (Task 7 policy)
                total_price=line_total,
                created_by=business.owner_id,
            )
        )

    new_order = Order(
        business_id=business.id,
        customer_id=customer.id,
        status=order.status or "pending",
        total_amount=round(total, 2),
        created_by=business.owner_id,
        items=item_models,
    )
    db.add(new_order)
    # Flush assigns new_order.id, needed as the ledger reference below.
    await db.flush()

    # Deduct one line at a time under the optimistic lock (Task 11 / audit H1).
    # A stale version on ANY line aborts the whole request; get_db rolls back,
    # leaving both the order and all stock untouched.
    for product, item in lines:
        await _change_stock(
            db, business.id, product, -item.quantity,
            StockMovementReason.order, business.owner_id, order_id=new_order.id,
        )
    await audit_mod.record_audit(
        db, business.id, "orders", new_order.id, "create",
        change={
            "customer_id": new_order.customer_id,
            "total_amount": new_order.total_amount,
            "status": "pending",
        },
        actor=business.owner_id,
    )
    return _serialize_order(await _load_order(new_order.id, business, db))


def _parse_order_id(term: str) -> Optional[int]:
    """Parse an order id out of a search term (Task 12 / M7).

    Accepts the forms the UI shows and users type: ``12``, ``0012``,
    ``#ORD-0012`` and ``ORD-0012`` all resolve to order id 12. Returns None
    when the term does not look like an order reference (so it can still match
    a customer name via ILIKE).
    """
    t = term.strip().upper()
    if t.startswith("#"):
        t = t[1:]
    if t.startswith("ORD-"):
        t = t[len("ORD-"):]
    t = t.lstrip("0") or "0"
    if t.isdigit():
        return int(t)
    return None


@app.get("/orders", response_model=OrderListResponse, tags=["Orders"])
async def list_orders(
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None, min_length=1),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> OrderListResponse:
    base = (
        select(Order)
        .options(
            selectinload(Order.customer),
            selectinload(Order.items).selectinload(OrderItem.product),
        )
        .where(Order.business_id == business.id, Order.deleted_at.is_(None))
    )
    if status_filter:
        base = base.where(Order.status == status_filter)
    if search:
        like = f"%{search.strip().lower()}%"
        conditions = [Customer.full_name.ilike(like)]
        order_id = _parse_order_id(search)
        if order_id is not None:
            conditions.append(Order.id == order_id)
        base = base.join(Customer, Order.customer_id == Customer.id).where(or_(*conditions))
    if start_date:
        base = base.where(Order.created_at >= start_date)
    if end_date:
        base = base.where(Order.created_at <= end_date)

    total = (
        await db.execute(select(func.count()).select_from(base.order_by(None).subquery()))
    ).scalar() or 0
    rows = (await db.execute(
        base.order_by(Order.id.desc()).offset((page - 1) * limit).limit(limit)
    )).scalars().all()

    return OrderListResponse(
        items=[_serialize_order(o) for o in rows], total=total, page=page, limit=limit
    )


@app.get("/orders/{id}", response_model=OrderOut, tags=["Orders"])
async def get_order(
    id: int,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> OrderOut:
    return _serialize_order(await _load_order(id, business, db))


@app.put("/orders/{id}/status", response_model=OrderOut, tags=["Orders"])
async def update_order_status(
    id: int,
    updates: OrderUpdate,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> OrderOut:
    order = await _load_order(id, business, db)
    if updates.status is None:
        return _serialize_order(order)

    current = order.status.value if hasattr(order.status, "value") else str(order.status)
    requested = updates.status.value if hasattr(updates.status, "value") else str(updates.status)

    if requested not in ALLOWED_ORDER_TRANSITIONS.get(current, set()):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot transition order from '{current}' to '{requested}'",
        )

    # Cancellation restores stock exactly once (Task 7 policy) and logs it.
    if requested == "cancelled":
        await _restore_stock(db, order, business.owner_id, StockMovementReason.order_cancelled)

    order.status = updates.status
    order.updated_by = business.owner_id
    await db.flush()
    await db.refresh(order)
    await audit_mod.record_audit(
        db, business.id, "orders", order.id, "status",
        change={"from": current, "to": requested}, actor=business.owner_id,
    )
    # Re-load relationships refreshed by the stock restore.
    return _serialize_order(await _load_order(id, business, db))


@app.delete("/orders/{id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Orders"])
async def delete_order(
    id: int,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> None:
    order = await _load_order(id, business, db)
    # Restore stock unless already cancelled (which already restored once).
    current = order.status.value if hasattr(order.status, "value") else str(order.status)
    if current != "cancelled":
        await _restore_stock(db, order, business.owner_id, StockMovementReason.order_deleted)
    order.deleted_at = datetime.utcnow()
    order.deleted_by = business.owner_id
    await db.flush()
    await audit_mod.record_audit(
        db, business.id, "orders", order.id, "delete",
        change={"status": current}, actor=business.owner_id,
    )


# ---------------------------------------------------------------------------
# Dashboard Analytics (tenant-scoped)
# ---------------------------------------------------------------------------

def _first_day_of_month(dt: date) -> date:
    return dt.replace(day=1)


def _next_month_start(dt: date) -> date:
    return date(dt.year + 1, 1, 1) if dt.month == 12 else date(dt.year, dt.month + 1, 1)


@app.get("/dashboard/summary", response_model=DashboardSummary, tags=["Dashboard"])
async def dashboard_summary(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> DashboardSummary:
    """One round-trip KPI bundle for the Dashboard."""
    today = date.today()
    first_this = _first_day_of_month(today)
    first_next = _next_month_start(today)
    first_last = (
        date(today.year, today.month - 1, 1)
        if today.month > 1
        else date(today.year - 1, 12, 1)
    )

    bid = business.id
    order_scope = [Order.business_id == bid, Order.deleted_at.is_(None)]

    # Revenue/orders today (delivered).
    today_row = (await db.execute(
        select(func.coalesce(func.sum(Order.total_amount), 0.0), func.count(Order.id))
        .where(
            *order_scope,
            Order.status == "delivered",
            Order.order_date >= datetime.combine(today, time.min),
        )
    )).one()

    # Revenue/orders this month (shipped + delivered).
    month_row = (await db.execute(
        select(func.coalesce(func.sum(Order.total_amount), 0.0), func.count(Order.id))
        .where(*order_scope, Order.status.in_(_ACTIVE_STATUSES),
               Order.order_date >= datetime.combine(first_this, time.min),
               Order.order_date < datetime.combine(first_next, time.min))
    )).one()

    # Last month revenue -> growth %.
    last_rev = (await db.execute(
        select(func.coalesce(func.sum(Order.total_amount), 0.0))
        .where(*order_scope, Order.status.in_(_ACTIVE_STATUSES),
               Order.order_date >= datetime.combine(first_last, time.min),
               Order.order_date < datetime.combine(first_this, time.min))
    )).scalar() or 0.0
    growth = round(((month_row[0] - last_rev) / last_rev) * 100, 2) if last_rev else None

    # Profit this month: sum((unit_price - cost_price) * qty) over order items.
    profit = (await db.execute(
        select(func.coalesce(
            func.sum(
                (OrderItem.unit_price - func.coalesce(Product.cost_price, 0.0))
                * OrderItem.quantity
            ),
            0.0,
        ))
        .join(Order, Order.id == OrderItem.order_id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(Order.business_id == bid, Order.deleted_at.is_(None),
               Order.status.in_(_ACTIVE_STATUSES),
               Order.order_date >= datetime.combine(first_this, time.min),
               Order.order_date < datetime.combine(first_next, time.min))
    )).scalar() or 0.0

    # Inventory metrics (low/out use the shared mutually-exclusive definition).
    inv_row = (await db.execute(
        select(
            func.count(Product.id),
            func.coalesce(
                func.sum(
                    Product.current_stock * func.coalesce(Product.cost_price, Product.unit_price)
                ),
                0.0,
            ),
            func.coalesce(func.sum(_strictly_low_stock_case()), 0),
            func.coalesce(func.sum(_out_of_stock_case()), 0),
        ).where(Product.business_id == bid, Product.deleted_at.is_(None))
    )).one()

    # Customers.
    cust_total = (await db.execute(
        select(func.count(Customer.id)).where(
            Customer.business_id == bid, Customer.deleted_at.is_(None)
        )
    )).scalar() or 0
    cust_new = (await db.execute(
        select(func.count(Customer.id)).where(
            Customer.business_id == bid, Customer.deleted_at.is_(None),
            Customer.created_at >= datetime.combine(first_this, time.min))
    )).scalar() or 0

    return DashboardSummary(
        revenue_today=today_row[0],
        orders_today=today_row[1],
        revenue_month=month_row[0],
        orders_month=month_row[1],
        revenue_growth_percent=growth,
        profit_month=round(profit, 2),
        products_count=inv_row[0],
        inventory_value=inv_row[1],
        low_stock_count=inv_row[2],
        out_of_stock_count=inv_row[3],
        customers_total=cust_total,
        customers_new_month=cust_new,
    )


@app.get("/dashboard/revenue/timeseries", response_model=List[TimeseriesPoint], tags=["Dashboard"])
async def revenue_timeseries(
    days: int = Query(30, ge=7, le=365),
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> List[TimeseriesPoint]:
    """Daily revenue/orders for the Revenue chart (missing days are omitted;
    the frontend fills gaps with zeros rather than inventing data)."""
    since = datetime.combine(date.today() - timedelta(days=days - 1), time.min)
    day = func.date(Order.order_date).label("day")
    rows = (await db.execute(
        select(day, func.coalesce(func.sum(Order.total_amount), 0.0), func.count(Order.id))
        .where(Order.business_id == business.id, Order.deleted_at.is_(None),
               Order.status.in_(_ACTIVE_STATUSES), Order.order_date >= since)
        .group_by(day)
        .order_by(day)
    )).all()
    return [
        TimeseriesPoint(date=str(row[0]), revenue=row[1], orders=row[2])
        for row in rows
    ]


@app.get("/dashboard/inventory/by-category", response_model=List[CategoryValue], tags=["Dashboard"])
async def inventory_by_category(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> List[CategoryValue]:
    """Inventory value grouped by category for the donut chart."""
    category = func.coalesce(Product.category, "Uncategorized").label("category")
    value = (
        func
        .sum(Product.current_stock * func.coalesce(Product.cost_price, Product.unit_price))
        .label("value")
    )
    rows = (await db.execute(
        select(category, value)
        .where(Product.business_id == business.id, Product.deleted_at.is_(None))
        .group_by(category)
        .order_by(value.desc())
    )).all()
    return [CategoryValue(category=row[0], value=row[1] or 0.0) for row in rows]


@app.get("/dashboard/revenue/today", response_model=RevenueTodayResponse, tags=["Dashboard"])
async def revenue_today(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> RevenueTodayResponse:
    row = (await db.execute(
        select(func.coalesce(func.sum(Order.total_amount), 0.0), func.count(Order.id))
        .where(Order.business_id == business.id, Order.deleted_at.is_(None),
               Order.status == "delivered",
               Order.order_date >= datetime.combine(date.today(), time.min))
    )).one()
    return RevenueTodayResponse(total_revenue=row[0], delivered_orders=row[1])


@app.get("/dashboard/revenue/month", response_model=RevenueMonthResponse, tags=["Dashboard"])
async def revenue_current_month(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> RevenueMonthResponse:
    today = date.today()
    row = (await db.execute(
        select(func.coalesce(func.sum(Order.total_amount), 0.0), func.count(Order.id))
        .where(Order.business_id == business.id, Order.deleted_at.is_(None),
               Order.status.in_(_ACTIVE_STATUSES),
               Order.order_date >= datetime.combine(_first_day_of_month(today), time.min),
               Order.order_date < datetime.combine(_next_month_start(today), time.min))
    )).one()
    return RevenueMonthResponse(total_revenue=row[0], total_orders=row[1])


@app.get("/dashboard/growth", response_model=GrowthResponse, tags=["Dashboard"])
async def growth_monthly_revenue(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> GrowthResponse:
    today = date.today()
    first_this = _first_day_of_month(today)
    first_last = (
        date(today.year, today.month - 1, 1)
        if today.month > 1
        else date(today.year - 1, 12, 1)
    )
    scope = [
        Order.business_id == business.id,
        Order.deleted_at.is_(None),
        Order.status.in_(_ACTIVE_STATUSES),
    ]

    this_rev = (await db.execute(
        select(func.coalesce(func.sum(Order.total_amount), 0.0)).where(
            *scope,
            Order.order_date >= datetime.combine(first_this, time.min),
            Order.order_date < datetime.combine(_next_month_start(today), time.min))
    )).scalar() or 0.0
    last_rev = (await db.execute(
        select(func.coalesce(func.sum(Order.total_amount), 0.0)).where(
            *scope,
            Order.order_date >= datetime.combine(first_last, time.min),
            Order.order_date < datetime.combine(first_this, time.min))
    )).scalar() or 0.0

    growth = round(((this_rev - last_rev) / last_rev) * 100, 2) if last_rev else None
    return GrowthResponse(
        this_month_revenue=this_rev, last_month_revenue=last_rev, growth_percent=growth
    )


@app.get("/dashboard/low-stock", response_model=int, tags=["Dashboard"])
async def low_stock_items(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> int:
    # Same definition as dashboard/inventory summaries (strictly low: in stock
    # but at/below the reorder level, excluding out-of-stock products).
    stmt = select(func.count(Product.id)).where(
        Product.business_id == business.id, Product.deleted_at.is_(None),
        Product.current_stock > 0,
        Product.current_stock <= Product.reorder_level,
    )
    return (await db.execute(stmt)).scalar() or 0


@app.get("/dashboard/top-products", response_model=List[TopProductItem], tags=["Dashboard"])
async def top_products(
    limit: int = Query(5, ge=1, le=20),
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> List[TopProductItem]:
    stmt = (
        select(
            Product.id,
            Product.name,
            func.sum(OrderItem.quantity).label("total_quantity"),
            func.sum(OrderItem.quantity * OrderItem.unit_price).label("total_revenue"),
        )
        .join(OrderItem, OrderItem.product_id == Product.id)
        .where(Product.business_id == business.id)
        .group_by(Product.id, Product.name)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return [
        TopProductItem(product_id=row.id, product_name=row.name,
                       total_quantity=row.total_quantity, total_revenue=row.total_revenue)
        for row in rows
    ]

# ---------------------------------------------------------------------------
# Intelligent Import (v1 Instant Onboarding)
#
# API design (spec item 14):
#   GET  /imports/schema    — the strict Co-op schema (mapper + UI targets)
#   POST /imports/preview   — parse + detect dataset (file)
#   POST /imports/map       — SUGGEST mapping from headers + sample rows only
#                             (never the full file; LLM seam, spec item 2)
#   POST /imports/validate  — read-only validation pass (NO writes, item 6)
#   POST /imports/commit    — the ONLY endpoint that mutates (one transaction,
#                             stamped with an ImportBatch, spec items 7/9)
#
# Trust model: the mapper only suggests; the user reviews and confirms;
# validate proves what would happen; commit executes.
# ---------------------------------------------------------------------------

MAX_IMPORT_BYTES = 5 * 1024 * 1024  # 5 MB
MAX_SAMPLE_ROWS = 50


async def _read_upload(file: UploadFile) -> bytes:
    data = await file.read()
    if len(data) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=400, detail="File is too large (max 5 MB).")
    return data


def _parsed_or_400(filename: str, data: bytes) -> importer.ParsedFile:
    parsed = importer.parse_file(filename, data)
    if parsed.error:
        raise HTTPException(status_code=400, detail=parsed.error)
    if not parsed.headers:
        raise HTTPException(status_code=400, detail="No columns found in the file.")
    return parsed


@app.get("/imports/schema", tags=["Import"])
async def imports_schema(
    business: Business = Depends(get_current_business),
) -> dict:
    """The strict Co-op import schema — the only target fields the mapper
    (human or LLM) may choose from (spec item 4)."""
    return importer.mapping_schemas_payload()


@app.post("/imports/preview", tags=["Import"])
async def imports_preview(
    file: UploadFile = File(...),
    business: Business = Depends(get_current_business),
) -> dict:
    """Parse the file and detect its dataset. No mapping yet, no writes."""
    data = await _read_upload(file)
    parsed = _parsed_or_400(file.filename or "upload", data)
    dataset_key, confidence = importer.detect_dataset(parsed)
    return {
        "filename": parsed.filename,
        "fmt": parsed.fmt,
        "row_count": len(parsed.rows),
        "columns": parsed.headers,
        "sample_rows": parsed.rows[:MAX_SAMPLE_ROWS],
        "entity": dataset_key,
        "entity_confidence": round(confidence, 2),
    }


class ImportMapRequest(BaseModel):
    entity: str
    headers: List[str]
    sample_rows: List[List[Any]] = []


@app.post("/imports/map", tags=["Import"])
async def imports_map(
    payload: ImportMapRequest,
    business: Business = Depends(get_current_business),
) -> dict:
    """Suggest a column mapping from headers + sample rows ONLY.

    This is the LLM seam: v1 runs a deterministic alias + sample-shape
    engine; a model can be dropped in here with the identical input/output
    contract and would only ever see headers + a 50-row sample (spec item 2).
    It may only target fields from /imports/schema — it cannot invent them.
    """
    if payload.entity not in importer.DATASETS:
        raise HTTPException(status_code=400, detail=f"Unknown entity: {payload.entity}")
    parsed = importer.ParsedFile(
        filename="upload",
        fmt="csv",
        headers=list(payload.headers),
        rows=[list(r)[: len(payload.headers)] for r in payload.sample_rows[:MAX_SAMPLE_ROWS]],
    )
    suggested = importer.suggest_mapping(parsed, payload.entity)
    return {
        "entity": payload.entity,
        "mappings": [
            {
                "column": m.column,
                "field": m.target,
                "confidence": m.confidence,
                "label": m.label,
                "hints": m.hints,
            }
            for m in suggested
        ],
    }


class ImportRunRequest(BaseModel):
    entity: str
    mapping: Dict[str, Optional[str]]  # {source_column: field_key_or_null}


async def _run_import_payload(
    payload: ImportRunRequest,
    data: bytes,
    filename: str,
    business: Business,
    db: AsyncSession,
):
    if payload.entity not in importer.DATASETS:
        raise HTTPException(status_code=400, detail=f"Unknown entity: {payload.entity}")
    for col, target in payload.mapping.items():
        if target is not None and target not in importer.DATASETS[payload.entity].fields:
            raise HTTPException(status_code=400, detail=f"Unknown target field: {target}")
    parsed = _parsed_or_400(filename, data)
    if not parsed.rows:
        raise HTTPException(status_code=400, detail="The file contains no data rows.")
    return parsed


@app.post("/imports/validate", tags=["Import"])
async def imports_validate(
    file: UploadFile = File(...),
    entity: str = Form("products"),
    mapping: str = Form("{}"),
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Read-only validation pass BEFORE any database writes (spec item 6):
    "1,248 rows received — 1,201 valid, 23 duplicates, 7 missing dates…"."""
    import json as _json
    try:
        mapping_dict = _json.loads(mapping or "{}")
    except _json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid mapping JSON.")
    data = await _read_upload(file)
    parsed = await _run_import_payload(
        ImportRunRequest(entity=entity, mapping=mapping_dict),
        data,
        file.filename or "upload",
        business,
        db,
    )
    v = await importer.validate_import(db, business.id, parsed, entity, mapping_dict)
    return {
        "entity": v.dataset,
        "total_rows": v.total_rows,
        "valid_rows": v.valid_rows,
        "duplicates": v.duplicates,
        "unknown_refs": v.unknown_refs,
        "would_create": v.would_create,
        "errors": v.errors,
        "error_fields": v.error_fields,
        "ambiguous": v.ambiguous,
        "warnings": v.warnings,
    }


@app.post("/imports/commit", tags=["Import"])
async def imports_commit(
    file: UploadFile = File(...),
    entity: str = Form("products"),
    mapping: str = Form("{}"),
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
    _rate: None = Depends(enforce_import_rate_limit),
) -> dict:
    """The ONLY mutating import endpoint (spec item 7): one transaction,
    all-or-nothing, every created row stamped with its ImportBatch (item 9)."""
    import json as _json
    try:
        mapping_dict = _json.loads(mapping or "{}")
    except _json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid mapping JSON.")
    data = await _read_upload(file)
    parsed = await _run_import_payload(
        ImportRunRequest(entity=entity, mapping=mapping_dict),
        data,
        file.filename or "upload",
        business,
        db,
    )
    try:
        result = await importer.execute_import(db, business.id, parsed, entity, mapping_dict)
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail="The import failed and was rolled back. No data was written.",
        )
    await audit_mod.record_audit(
        db, business.id, "import_batches", result.batch_id, "import",
        change={
            "entity": result.dataset,
            "created": result.created,
            "skipped": result.skipped,
        },
        actor=business.owner_id,
    )
    return {
        "entity": result.dataset,
        "batch_id": result.batch_id,
        "total_rows": result.total_rows,
        "created": result.created,
        "skipped": result.skipped,
        "errors": result.errors,
        "warnings": result.warnings,
    }


@app.get("/dashboard/briefing", tags=["Dashboard"])
async def dashboard_briefing(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Day 1 Morning Briefing — verified, deterministic business intelligence
    over the business's real (imported + live) data (spec items 9/10/11)."""
    return await briefing_mod.build_briefing(db, business.id)


# ---------------------------------------------------------------------------
# First-run onboarding (v1 Instant Onboarding)
# ---------------------------------------------------------------------------

@app.get("/onboarding/state", tags=["Onboarding"])
async def onboarding_state(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Whether the tenant has any business data yet — drives the first-run
    "Welcome to Co-op" screen. A tenant counts as onboarded when it has at
    least one product, customer or order (imported or created live)."""
    scope = lambda m: (m.business_id == business.id, m.deleted_at.is_(None))  # noqa: E731
    prod = (
        await db.execute(select(func.count()).select_from(Product).where(*scope(Product)))
    ).scalar() or 0
    cust = (
        await db.execute(select(func.count()).select_from(Customer).where(*scope(Customer)))
    ).scalar() or 0
    orders = (
        await db.execute(select(func.count()).select_from(Order).where(*scope(Order)))
    ).scalar() or 0
    return {
        "has_data": (prod + cust + orders) > 0,
        "products": prod,
        "customers": cust,
        "orders": orders,
    }


# ---------------------------------------------------------------------------
# AI Platform (Pass 1) — grounded, verified, metered assistant
#
# Trust model: the model NEVER queries the database. /ai/chat builds a
# verified context from the business's real data, asks the model to explain
# it under a strict answer contract, validates any proposed actions against
# the fixed registry, and records the metered usage in the ai_usage ledger.
# AI is an enhancement and never blocks core operations (TRD Ch1.8): when the
# model layer is unavailable, the client falls back to the deterministic
# engine with an honest notice.
# ---------------------------------------------------------------------------

class AiReportRef(BaseModel):
    """Which report the owner is looking at (filters only — the data is
    rebuilt server-side by the reporting engine and never trusted from the
    client)."""
    key: str
    from_date: Optional[str] = Field(None, alias="from")
    to: Optional[str] = None
    compare: Optional[str] = None
    category: Optional[str] = None
    product_id: Optional[int] = None
    customer_id: Optional[int] = None


class AiChatRequest(BaseModel):
    question: str
    history: Optional[List[Dict[str, str]]] = None
    request_id: Optional[str] = None
    report: Optional[AiReportRef] = None


@app.post("/ai/chat", tags=["AI"])
async def ai_chat(
    req: AiChatRequest,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
    _rate: None = Depends(enforce_ai_rate_limit),
) -> dict:
    """One grounded AI turn: verified context -> model -> structured answer.

    Returns the answer contract {type, kind, title, message, basis,
    follow_ups, links, actions, actions_rejected, source, model,
    credits_used}. Proposed actions are resolved + business-validated; the
    UI still requires explicit user confirmation before anything executes.
    """
    if not ai_service.ai_enabled():
        raise HTTPException(
            status_code=503,
            detail="The AI assistant is not configured on this server (OPENAI_API_KEY).",
        )
    try:
        result = await ai_service.handle_chat(
            db,
            business,
            user_id=business.owner_id,
            question=req.question,
            history=req.history,
            request_id=req.request_id,
            report=req.report.model_dump(by_alias=True, exclude_none=True) if req.report else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except ai_service.InsufficientCredits as e:
        raise HTTPException(status_code=402, detail=e.to_dict())
    except ai_service.AiUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    return result


class AiUsageResponse(BaseModel):
    month: str
    requests: int
    input_tokens: int
    output_tokens: int
    credits_used: int


@app.get("/ai/usage", response_model=AiUsageResponse, tags=["AI"])
async def ai_usage(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> AiUsageResponse:
    """Real metered AI usage for the current calendar month (billing reads this)."""
    today = date.today()
    first = datetime.combine(today.replace(day=1), time.min)
    nxt_month = (
        date(today.year + 1, 1, 1)
        if today.month == 12
        else date(today.year, today.month + 1, 1)
    )
    last = datetime.combine(nxt_month, time.min)
    u = await ai_service.month_usage(db, business.id, first, last)
    return AiUsageResponse(
        month=today.strftime("%b %Y"),
        requests=u["requests"],
        input_tokens=u["input_tokens"],
        output_tokens=u["output_tokens"],
        credits_used=u["credits_used"],
    )


@app.get("/ai/forecast", tags=["AI"])
async def ai_forecast(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Deterministic revenue forecast (PRD Phase 3 — "Forecasting").

    A transparent least-squares trend over the business's real, verified
    monthly order data — never a black-box ML prediction, always labelled
    as an estimate. No model call, no credits: a pure calculation over
    verified data, so it is free and instant.
    """
    return await ai_forecast_mod.build_forecast(
        db, business.id, currency=business.currency or "USD"
    )


class AiHistoryItem(BaseModel):
    id: int
    question: str
    answer_kind: Optional[str] = None
    answer_title: Optional[str] = None
    answer_summary: Optional[str] = None
    report_key: Optional[str] = None
    model: Optional[str] = None
    credits_used: int = 0
    created_at: Optional[str] = None


class AiHistoryResponse(BaseModel):
    items: List[AiHistoryItem]
    total: int


@app.get("/ai/history", response_model=AiHistoryResponse, tags=["AI"])
async def ai_history_list(
    limit: int = Query(30, ge=1, le=200),
    offset: int = Query(0, ge=0),
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> AiHistoryResponse:
    """The owner's AI activity, newest first (PRD Phase 3 — "AI history").

    One entry per completed /ai/chat turn: the question, what kind of
    answer it got and a short summary. Failed requests are not listed —
    the history shows only what Co-op actually answered.
    """
    items, total = await ai_history_mod.list_history(db, business.id, limit=limit, offset=offset)
    return AiHistoryResponse(items=items, total=total)


@app.delete("/ai/history", tags=["AI"])
async def ai_history_clear(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete the business's AI activity (explicit owner action)."""
    deleted = await ai_history_mod.clear_history(db, business.id)
    return {"deleted": deleted}


# ---------------------------------------------------------------------------
# Billing + Credits (Real Billing phase) — plans and credit enforcement are
# REAL server-side state; payment collection is a later phase (nothing is
# charged yet, and the UI says so honestly).
# ---------------------------------------------------------------------------

class BillingPlanRequest(BaseModel):
    plan: str


class BillingTrialRequest(BaseModel):
    plan: str


@app.get("/billing/summary", tags=["Billing"])
async def billing_summary_route(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Plan + real credit position + the month's metered AI usage.

    Credits are computed (allowance − ledger), never stored — so this is
    always the source of truth for "you have N credits remaining".
    """
    from . import billing as billing_mod

    return await billing_mod.billing_summary(db, business)


@app.post("/billing/plan", tags=["Billing"])
async def billing_change_plan(
    req: BillingPlanRequest,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Switch plans. Real state (enforcement updates immediately); payment
    is deliberately NOT taken in this phase."""
    from . import billing as billing_mod
    from .billing import InvalidPlan, PaymentRequired, TrialLockedError

    try:
        await billing_mod.change_plan(db, business, req.plan, actor=business.owner_id)
    except InvalidPlan as e:
        raise HTTPException(status_code=422, detail=str(e))
    except TrialLockedError as e:
        # A started trial cannot be stopped — it runs to the end.
        raise HTTPException(status_code=409, detail={"error": "trial_locked",
                                                     "message": str(e)})
    except PaymentRequired as e:
        # Paid plans go through the paid checkout, not a free switch.
        raise HTTPException(status_code=402, detail={"error": "payment_required",
                                                     "message": str(e)})
    await audit_mod.record_audit(
        db, business.id, "subscriptions", None, "plan",
        change={"plan": req.plan}, actor=business.owner_id,
    )
    return await billing_mod.billing_summary(db, business)


@app.post("/billing/trial", tags=["Billing"])
async def billing_start_trial(
    req: BillingTrialRequest,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Start this business's one free trial of a paid plan.

    The trial grants the paid plan's allowance for a fixed window without
    touching the base plan, so it expires on its own — no scheduler, and
    nothing is charged (a payment provider is still deliberately unplugged).
    409 when the trial was already used or the business isn't eligible.
    """
    from . import billing as billing_mod
    from .billing import TrialError

    try:
        sub = await billing_mod.start_trial(db, business, req.plan, actor=business.owner_id)
    except TrialError as e:
        raise HTTPException(status_code=409, detail={"error": "trial_unavailable",
                                                     "message": str(e)})
    await audit_mod.record_audit(
        db, business.id, "subscriptions", None, "trial_start",
        change={
            "trial_plan": sub.trial_plan,
            "ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
        },
        actor=business.owner_id,
    )
    return await billing_mod.billing_summary(db, business)


class CheckoutRequest(BaseModel):
    plan: str
    interval: str = "monthly"
    return_url: Optional[str] = None


class VerifyPaymentRequest(BaseModel):
    reference: str


@app.get("/billing/payment-config", tags=["Billing"])
async def billing_payment_config_route() -> dict:
    """What the UI needs to render a real checkout.

    Reports whether payments are live, the currency, the intervals on offer
    and each plan's hosted payment page. Secret keys are never returned —
    ``verification`` only says whether the backend can confirm a charge.
    """
    from .paystack import public_config

    return public_config()


@app.post("/billing/checkout", tags=["Billing"])
async def billing_checkout_route(
    req: CheckoutRequest,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
    user: ClerkUser = Depends(verify_clerk_token),
) -> dict:
    """Start a Paystack charge and return the URL the owner should pay at.

    Writes a ``pending`` row in ``payments`` first, so the reference exists
    before the browser leaves — the plan only changes once Paystack confirms
    the charge (``/billing/payments/verify`` or the webhook).
    """
    from . import payments as payments_mod

    try:
        result = await payments_mod.start_checkout(
            db,
            business,
            plan=req.plan,
            interval=req.interval,
            email=business.owner_email or user.email,
            user_id=user.user_id,
            return_url=req.return_url,
        )
    except payments_mod.PaymentsError as e:
        raise HTTPException(status_code=422, detail=str(e))

    await audit_mod.record_audit(
        db, business.id, "payments", None, "checkout_started",
        change={"reference": result["reference"], "plan": result["plan"],
                "interval": result["interval"], "mode": result["mode"]},
        actor=user.user_id,
    )
    return result


@app.get("/billing/payments", tags=["Billing"])
async def billing_payments_route(
    limit: int = Query(20, ge=1, le=100),
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """This business's charge history (newest first)."""
    from . import payments as payments_mod

    return {"items": await payments_mod.list_payments(db, business, limit)}


@app.post("/billing/payments/verify", tags=["Billing"])
async def billing_verify_payment_route(
    req: VerifyPaymentRequest,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
    user: ClerkUser = Depends(verify_clerk_token),
) -> dict:
    """Confirm a reference with Paystack and upgrade the plan if it was paid.

    Called when the owner comes back from the payment page. The browser
    returning is NOT proof of anything: the plan changes only if Paystack
    reports the charge as successful, and it happens exactly once.
    """
    from . import billing as billing_mod
    from . import payments as payments_mod

    try:
        result = await payments_mod.verify_and_apply(db, business, req.reference)
    except payments_mod.PaymentsError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if result["applied"]:
        await audit_mod.record_audit(
            db, business.id, "payments", None, "payment_applied",
            change={"reference": req.reference, "plan": result["plan"]},
            actor=user.user_id,
        )
    return {"payment": result["payment"], "applied": result["applied"],
            "already_applied": result.get("already_applied", False),
            "summary": await billing_mod.billing_summary(db, business)}


@app.post("/webhooks/paystack", tags=["Billing"])
async def paystack_webhook_route(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Paystack's ``charge.success`` webhook — the authoritative confirmation.

    Unauthenticated by nature, so the body is checked against the
    ``x-paystack-signature`` HMAC-SHA512 over the RAW bytes before anything
    is parsed. A bad signature is a 401 and nothing else happens; a good
    signature always gets a 200 (Paystack retries otherwise, forever).
    """
    import json as json_mod

    from . import payments as payments_mod
    from .paystack import SIGNATURE_HEADER, paystack_config, verify_webhook_signature

    raw = await request.body()
    cfg = paystack_config()
    if not verify_webhook_signature(raw, request.headers.get(SIGNATURE_HEADER), cfg.secret_key):
        from .security_events import security_event

        security_event("paystack_bad_signature", path=request.url.path)
        raise HTTPException(status_code=401, detail="Invalid Paystack signature.")
    try:
        payload = json_mod.loads(raw or b"{}")
    except ValueError:
        raise HTTPException(status_code=400, detail="Webhook body is not valid JSON.")

    result = await payments_mod.apply_webhook_event(db, payload)

    if result.get("applied") and result.get("business_id"):
        await audit_mod.record_audit(
            db, int(result["business_id"]), "payments", None, "payment_applied",
            change={"reference": result.get("reference"), "plan": result.get("plan"),
                    "source": "webhook"},
            actor="paystack-webhook",
        )
    return {"received": True, **result}


# ---------------------------------------------------------------------------
# Licensing (PRD Ch7 §7.19 activation flow, Ch8 §8.15 License table)
#
# A licence is a self-contained HMAC-signed activation string binding a
# business id + plan + seats + expiry. The team mints them (script or the
# admin route below); the owner pastes one into Settings -> Licence, the
# signature is verified, and the plan is granted as a WINDOW on the
# subscription — never an overwrite of the owned plan — so expiry needs no
# scheduler (same design as the free trial).
#
# Two audiences, two gates:
#   /admin/*   — the Co-op team only: a shared secret in X-Admin-Token,
#                compared in constant time. This is the one surface in the
#                API that is not Clerk-authenticated, because keys are minted
#                from a script with no user session. No token configured =>
#                the routes are closed (503), never open.
#   /licenses* — the customer: Clerk-authenticated, owner-only, and a key
#                issued to another business is a 403 rather than a re-grant.
# ---------------------------------------------------------------------------

class AdminGenerateLicenseRequest(BaseModel):
    business_id: int
    plan: str
    days: Optional[int] = None
    seats: int = 1
    expires_at: Optional[date] = None


class AdminRevokeLicenseRequest(BaseModel):
    fingerprint: Optional[str] = None
    license_key: Optional[str] = None
    reason: Optional[str] = None


class LicenseActivateRequest(BaseModel):
    key: str


async def require_admin_token(request: Request) -> str:
    """Team-only gate for the licence-issuing routes (see block comment)."""
    from . import licensing as licensing_mod

    tokens = licensing_mod.admin_tokens()
    if not tokens:
        raise HTTPException(
            status_code=503,
            detail="Licence issuing is not configured on this server",
        )
    presented = request.headers.get("x-admin-token", "")
    if not presented or not any(secrets.compare_digest(presented, t) for t in tokens):
        from .security_events import security_event

        security_event("admin_token_rejected", path=request.url.path)
        raise HTTPException(status_code=403, detail="Admin token rejected")
    return "admin-token"


def _license_audit_change(row: License) -> dict:
    """Never the key itself — the fingerprint is the reference."""
    return {
        "fingerprint": row.fingerprint,
        "plan": row.plan,
        "seats": row.seats,
        "expires_at": row.expires_at.isoformat() if row.expires_at else None,
    }


@app.post("/admin/generate-license", tags=["Admin"])
async def admin_generate_license(
    req: AdminGenerateLicenseRequest,
    db: AsyncSession = Depends(get_db),
    _admin: str = Depends(require_admin_token),
) -> dict:
    """Mint a signed activation string for one business (team only).

    The business must exist: minting against a typo'd id would produce a key
    nobody can ever activate. The response carries the key exactly once —
    the server keeps only its fingerprint.
    """
    from . import licensing as licensing_mod

    business = (await db.execute(
        select(Business).where(Business.id == req.business_id, Business.deleted_at.is_(None))
    )).scalars().first()
    if business is None:
        raise HTTPException(status_code=404, detail="No such business")

    expires = datetime.combine(req.expires_at, time.min) if req.expires_at else None
    try:
        issued = licensing_mod.issue(
            business.id, req.plan, seats=req.seats, days=req.days, expires_at=expires
        )
    except licensing_mod.LicenseError as e:
        raise HTTPException(status_code=422, detail={"error": e.reason, "message": e.message})

    row = License(
        business_id=business.id,
        fingerprint=issued.fingerprint,
        plan=issued.plan,
        seats=issued.seats,
        issued_at=issued.issued_at,
        expires_at=issued.expires_at,
    )
    db.add(row)
    await db.flush()
    await audit_mod.record_audit(
        db, business.id, "licenses", row.id, "license_issue",
        change=_license_audit_change(row), actor=_admin,
    )
    return issued.to_dict()


@app.get("/admin/licenses", tags=["Admin"])
async def admin_list_licenses(
    business_id: Optional[int] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _admin: str = Depends(require_admin_token),
) -> dict:
    """Every licence the team has minted — the support view (team only)."""
    stmt = select(License).order_by(License.id.desc()).limit(limit)
    if business_id is not None:
        stmt = stmt.where(License.business_id == business_id)
    rows = (await db.execute(stmt)).scalars().all()
    return {
        "licenses": [
            {
                "id": r.id,
                "business_id": r.business_id,
                "fingerprint": r.fingerprint,
                "plan": r.plan,
                "seats": r.seats,
                "issued_at": r.issued_at.isoformat() if r.issued_at else None,
                "activated_at": r.activated_at.isoformat() if r.activated_at else None,
                "activated_by": r.activated_by,
                "expires_at": r.expires_at.isoformat() if r.expires_at else None,
                "revoked_at": r.revoked_at.isoformat() if r.revoked_at else None,
                "revoked_reason": r.revoked_reason,
            }
            for r in rows
        ]
    }


@app.post("/admin/licenses/revoke", tags=["Admin"])
async def admin_revoke_license(
    req: AdminRevokeLicenseRequest,
    db: AsyncSession = Depends(get_db),
    _admin: str = Depends(require_admin_token),
) -> dict:
    """Revoke a licence by fingerprint (or by the key itself) — team only.

    Revocation wins over a valid signature and withdraws the granted plan
    immediately, because the grant lives on the subscription window.
    """
    from . import licensing as licensing_mod

    fp = req.fingerprint
    if not fp and req.license_key:
        try:
            fp = licensing_mod.fingerprint(req.license_key)
        except licensing_mod.LicenseError:
            fp = None
    if not fp:
        raise HTTPException(status_code=422, detail="Provide fingerprint or license_key")
    try:
        row = await licensing_mod.revoke(db, fp, reason=req.reason, actor=_admin)
    except licensing_mod.LicenseError as e:
        raise HTTPException(
            status_code=404, detail={"error": e.reason, "message": e.message}
        )
    await audit_mod.record_audit(
        db, row.business_id, "licenses", row.id, "license_revoke",
        change={**_license_audit_change(row), "reason": row.revoked_reason}, actor=_admin,
    )
    return {
        "revoked": True,
        "fingerprint": row.fingerprint,
        "business_id": row.business_id,
        "revoked_at": row.revoked_at.isoformat() if row.revoked_at else None,
    }


@app.get("/licenses", tags=["Licensing"])
async def license_status(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """This business's licence position (Settings -> Licence)."""
    from . import billing as billing_mod

    sub = await billing_mod.get_or_create_subscription(db, business)
    return {
        "license": billing_mod.license_state(sub),
        "effective_plan": billing_mod.effective_plan(sub),
    }


@app.post("/licenses/activate", tags=["Licensing"])
async def license_activate(
    req: LicenseActivateRequest,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
    user: ClerkUser = Depends(verify_clerk_token),
    _owner: str = Depends(team_mod.require_owner),
) -> dict:
    """Activate a licence key for the caller's own business (owner only).

    Honest refusals: a key issued to another business (403), a revoked key
    (403), a key already activated elsewhere (403), and an invalid/expired
    key (422) each carry a machine-readable ``error`` the UI can explain.
    """
    from . import billing as billing_mod
    from . import licensing as licensing_mod

    try:
        row = await licensing_mod.activate(db, business, req.key, actor=business.owner_id)
    except licensing_mod.LicenseError as e:
        code = 403 if e.reason in ("wrong_business", "already_activated", "revoked") else 422
        raise HTTPException(status_code=code, detail={"error": e.reason, "message": e.message})

    await audit_mod.record_audit(
        db, business.id, "licenses", row.id, "license_activate",
        change=_license_audit_change(row), actor=business.owner_id,
    )
    return await billing_mod.billing_summary(db, business)


# ---------------------------------------------------------------------------
# Invoicing (PRD "Invoice generation")
#
# A saved invoice per order, numbered per business (INV-0001, ...). The money
# is never duplicated: the invoice points at its order, which stays the single
# source of truth for amounts. Lifecycle is draft -> sent -> void; recording
# money received belongs to the payments phase.
# ---------------------------------------------------------------------------

class InvoiceCreateRequest(BaseModel):
    order_id: int
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None


class InvoiceUpdateRequest(BaseModel):
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None
    status: Optional[str] = None


def _invoice_http_error(e) -> HTTPException:
    code = {"order_not_found": 404, "not_found": 404,
            "already_invoiced": 409}.get(e.reason, 422)
    return HTTPException(status_code=code, detail={"error": e.reason, "message": e.message})


@app.post("/invoices", status_code=status.HTTP_201_CREATED, tags=["Invoices"])
async def create_invoice(
    req: InvoiceCreateRequest,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create the invoice for one of this business's orders.

    One invoice per order (409 on a second attempt) and one number per
    business, both enforced by unique indexes rather than by convention.
    """
    from . import invoicing as invoicing_mod

    try:
        row = await invoicing_mod.create_for_order(
            db, business, req.order_id,
            issue_date=datetime.combine(req.issue_date, time.min) if req.issue_date else None,
            due_date=datetime.combine(req.due_date, time.min) if req.due_date else None,
            notes=req.notes,
            actor=business.owner_id,
        )
    except invoicing_mod.InvoiceError as e:
        raise _invoice_http_error(e)
    await audit_mod.record_audit(
        db, business.id, "invoices", row.id, "create",
        change={"number": row.number, "order_id": row.order_id}, actor=business.owner_id,
    )
    return await invoicing_mod.detail(db, business, row.id)


@app.get("/invoices", tags=["Invoices"])
async def list_invoices_route(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None),
    status_: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
) -> dict:
    """The Invoices list — number, customer, dates, status and order total."""
    from . import invoicing as invoicing_mod

    try:
        return await invoicing_mod.list_invoices(
            db, business, search=search, status=status_, page=page, limit=limit
        )
    except invoicing_mod.InvoiceError as e:
        raise _invoice_http_error(e)


@app.get("/invoices/export", tags=["Invoices"])
async def export_invoices(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
    format: str = Query("csv", alias="format"),
    search: Optional[str] = Query(None),
    status_: Optional[str] = Query(None, alias="status"),
) -> Response:
    """CSV of exactly the invoices the list is showing (same filters)."""
    from . import invoicing as invoicing_mod

    if format.strip().lower() != "csv":
        raise HTTPException(status_code=422, detail="format must be: csv")
    try:
        data = await invoicing_mod.list_invoices(
            db, business, search=search, status=status_, page=1, limit=1000
        )
    except invoicing_mod.InvoiceError as e:
        raise _invoice_http_error(e)
    return Response(
        content=invoicing_mod.render_csv(business, data["items"]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="coop_invoices.csv"'},
    )


@app.get("/invoices/{invoice_id}", tags=["Invoices"])
async def invoice_detail(
    invoice_id: int,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """One invoice with its order and customer."""
    from . import invoicing as invoicing_mod

    try:
        return await invoicing_mod.detail(db, business, invoice_id)
    except invoicing_mod.InvoiceError as e:
        raise _invoice_http_error(e)


@app.patch("/invoices/{invoice_id}", tags=["Invoices"])
async def update_invoice_route(
    invoice_id: int,
    req: InvoiceUpdateRequest,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Edit dates/notes or move draft -> sent -> void. A void invoice is
    terminal: it is paperwork the customer may already hold."""
    from . import invoicing as invoicing_mod

    try:
        row = await invoicing_mod.update_invoice(
            db, business, invoice_id,
            issue_date=datetime.combine(req.issue_date, time.min) if req.issue_date else None,
            due_date=datetime.combine(req.due_date, time.min) if req.due_date else None,
            notes=req.notes,
            status=req.status,
            actor=business.owner_id,
        )
    except invoicing_mod.InvoiceError as e:
        raise _invoice_http_error(e)
    await audit_mod.record_audit(
        db, business.id, "invoices", row.id, "update",
        change={"number": row.number, "status": row.status}, actor=business.owner_id,
    )
    return await invoicing_mod.detail(db, business, row.id)


# ---------------------------------------------------------------------------
# Notifications (v1: in-app daily business summary)
#
# Computed on demand from the existing reporting/briefing layer — no second
# calculation path, no scheduler, no persistence (so repeated same-day
# requests yield the same summary and nothing can duplicate). The LLM is not
# involved; every number is deterministic.
# ---------------------------------------------------------------------------

@app.get("/notifications/daily-summary", response_model=DailySummarySchema, tags=["Notifications"])
async def notifications_daily_summary(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> DailySummarySchema:
    """Today's verified business summary for the in-app notification panel."""
    return await build_daily_summary(db, business)


class SummarySendRequest(BaseModel):
    email: Optional[EmailStr] = None


@app.post("/notifications/summary/send", tags=["Notifications"])
async def send_daily_summary_email(
    payload: SummarySendRequest,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
    user: ClerkUser = Depends(verify_clerk_token),
) -> dict:
    """Email today's verified summary to the owner/manager (or the address
    they give). SMTP settings come from notifications.smtp + env overrides;
    unconfigured deployments answer 503 — the in-app summary still works."""
    recipient = payload.email or user.email or business.owner_email
    if not recipient:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide an email address to deliver to",
        )
    _SUMMARY_EMAIL_LIMITER.check(f"summary:{business.id}:{user.user_id}")
    summary = await build_daily_summary(db, business)
    try:
        await run_in_threadpool(delivery_mod.send_daily_summary_email, summary, recipient)
    except delivery_mod.EmailNotConfiguredError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email delivery is not configured for this deployment",
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The email provider rejected the message — try again later",
        )
    await audit_mod.record_audit(
        db,
        business.id,
        "notifications",
        None,
        "SUMMARY_EMAIL",
        {"email": recipient, "date": summary.date},
        actor=user.user_id,
    )
    return {"ok": True, "email": recipient, "date": summary.date}


# ---------------------------------------------------------------------------
# Sync (offline-first, OFFLINE 3 — one-way push first, ADR-002)
#
# The desktop app pushes offline-originated operations here when
# connectivity returns. Every op is idempotent on its client_id, so a retried
# batch applies exactly once. Stock arrives as operations (signed movements),
# never as final values, and the server re-validates (ADR-002 rule 7).
# ---------------------------------------------------------------------------

class SyncPushOperation(BaseModel):
    entity: str  # customer | product | order | order_item | stock_movement
    client_id: str  # client-generated ULID (idempotency key)
    operation: str  # create | update | delete
    payload: Dict[str, Any] = Field(default_factory=dict)
    # The local queue row id (OFFLINE 4): echoed back in the structured
    # conflict entry so the queue can attribute the conflict to its op.
    operation_id: Optional[str] = None


class SyncPushRequest(BaseModel):
    operations: List[SyncPushOperation] = Field(default_factory=list)


@app.post("/sync/push", tags=["Sync"])
async def sync_push(
    req: SyncPushRequest,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Apply a batch of offline operations idempotently. Returns applied /
    skipped counts, a client_id -> server id map, and any per-op errors."""
    ops = [o.model_dump() for o in req.operations]
    return await apply_push(db, business.id, ops)


@app.get("/sync/pull", tags=["Sync"])
async def sync_pull(
    since: Optional[datetime] = Query(
        None, description="Delta cursor (ISO). Omit for a full dump."
    ),
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Cloud -> local mirror payload (OFFLINE 3, Part 1).

    No ``since`` -> full dump (initial pull, includes soft-deleted rows so the
    mirror can reflect deletions). ``since`` set -> delta (rows changed since
    the cursor). Each record carries ``id`` + ``client_id`` so the local/cloud
    identity mapping stays stable. Returns a ``cursor`` for the next delta.
    """
    return await build_pull_payload(db, business, since=since)


# ---------------------------------------------------------------------------
# Reports (Reports phase) — one verified engine, many consumers
#
# The reporting engine (backend/reports) is the SINGLE source of truth: the
# Reports UI, CSV/XLSX/PDF exports and the AI context all read the same
# ReportData for the same filters, so the screen, the file and the
# explanation can never disagree about a number.
# ---------------------------------------------------------------------------

def _report_filters(
    from_: Optional[str],
    to: Optional[str],
    compare: Optional[str],
    category: Optional[str],
    product_id: Optional[int],
    customer_id: Optional[int],
) -> ReportFilters:
    try:
        return ReportFilters.from_query(
            from_str=from_, to_str=to, compare=compare,
            category=category, product_id=product_id, customer_id=customer_id,
        )
    except FilterError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.get("/reports/meta", tags=["Reports"])
async def reports_meta(
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Available reports + the tenant's product categories (for the filter UI)."""
    cats = (await db.execute(
        select(func.distinct(Product.category)).where(
            Product.business_id == business.id,
            Product.deleted_at.is_(None),
            Product.category.is_not(None),
        )
    )).scalars().all()
    return {
        "reports": [{"key": k, "title": v} for k, v in REPORT_TITLES.items()],
        "categories": sorted(c for c in cats if c),
        "compare_options": ["none", "previous_period", "previous_month", "previous_year"],
    }


@app.get("/reports/{key}", tags=["Reports"])
async def get_report(
    key: str,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    compare: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    product_id: Optional[int] = Query(None),
    customer_id: Optional[int] = Query(None),
) -> dict:
    """One verified report dataset for the given filters (deterministic)."""
    if key not in REPORT_TITLES:
        raise HTTPException(status_code=404, detail=f"Unknown report '{key}'.")
    f = _report_filters(from_, to, compare, category, product_id, customer_id)
    return (await build_report(db, business.id, key, f)).to_dict()


@app.get("/reports/{key}/export", tags=["Reports"])
async def export_report_route(
    key: str,
    business: Business = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
    format: str = Query("csv", alias="format"),
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    compare: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    product_id: Optional[int] = Query(None),
    customer_id: Optional[int] = Query(None),
    _rate: None = Depends(enforce_export_rate_limit),
) -> Response:
    """Export EXACTLY what the screen shows: same engine, same filters."""
    if key not in REPORT_TITLES:
        raise HTTPException(status_code=404, detail=f"Unknown report '{key}'.")
    f = _report_filters(from_, to, compare, category, product_id, customer_id)
    data = await build_report(db, business.id, key, f)
    try:
        content, filename, media_type = export_report(data, format)
    except ExportError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
