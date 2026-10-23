"""Real Billing + Credits (phase: make credits and plan enforcement real).

The dependency chain, top to bottom:

    AI request  ->  ai_usage ledger  ->  credits consumed
                 ->  plan allowance (config)  ->  remaining balance
                 ->  enforcement  ->  Billing UI  ->  (payment provider later)

Design decisions
----------------
* **Credits are computed, never stored.** ``remaining = allowance - SUM
  (ai_usage.credits_used this month)``. The ledger written by the AI
  service is the single source of truth — there is no balance column that
  can drift, and re-computation is always reproducible.
* **Calendar-month periods.** Allowances refresh on the 1st; usage is
  month-to-date. Simple, deterministic, testable.
* **Config-driven allowances.** Plan names/prices are product decisions
  (config/<env>.json "billing" section), so the credit economy can change
  without touching this code — same rule that governs the credit policy.
* **Payments run through Paystack.** ``backend/paystack.py`` and
  ``backend/payments.py`` own the charge; this module only exposes whether a
  provider is live (``payment_connected``) and applies the plan change the
  same way a manual switch would, so trial and credit bookkeeping agree.
"""
from __future__ import annotations

import datetime as dt
import math
from dataclasses import dataclass
from typing import Any, Optional

from sqlalchemy import func, select

from .config import load_config
from .models import AiUsage, Business, Subscription
from .paystack import is_configured as paystack_is_configured

PLAN_FREE = "free"
PLAN_STARTER = "starter"
PLAN_PROFESSIONAL = "professional"
PLAN_ENTERPRISE = "enterprise"

VALID_PLANS = (PLAN_FREE, PLAN_STARTER, PLAN_PROFESSIONAL, PLAN_ENTERPRISE)

# Plans a trial can be taken on (a trial of "free" is meaningless).
TRIALABLE_PLANS = (PLAN_STARTER, PLAN_PROFESSIONAL, PLAN_ENTERPRISE)

# Fallback trial length if config is missing (mirrors config/*.json).
DEFAULT_TRIAL_DAYS = 10

# Fallback allowances if config is missing (mirrors config/*.json).
DEFAULT_ALLOWANCES: dict[str, Optional[int]] = {
    PLAN_FREE: 25,
    PLAN_STARTER: 200,
    PLAN_PROFESSIONAL: 1000,
    PLAN_ENTERPRISE: None,  # unlimited
}


class InvalidPlan(ValueError):
    pass


# ---------------------------------------------------------------------------
# Plan configuration (config-driven, like the credit policy)
# ---------------------------------------------------------------------------

def plan_config() -> dict[str, dict[str, Any]]:
    try:
        cfg = load_config().get("billing", {}).get("plans", {}) or {}
    except Exception:  # noqa: BLE001 — config must never break billing math
        cfg = {}
    out: dict[str, dict[str, Any]] = {}
    for plan in VALID_PLANS:
        entry = dict(cfg.get(plan) or {})
        if "credits_per_month" not in entry:
            entry["credits_per_month"] = DEFAULT_ALLOWANCES[plan]
        out[plan] = entry
    return out


def allowance_for(plan: str) -> Optional[int]:
    """Monthly credit allowance; None = unlimited."""
    return plan_config().get(plan, {}).get("credits_per_month")


def plan_label(plan: str) -> str:
    return plan_config().get(plan, {}).get("label") or plan.capitalize()


def trial_config() -> dict[str, Any]:
    """Trial policy — product configuration, not code (config/<env>.json)."""
    try:
        cfg = load_config().get("billing", {}).get("trial", {}) or {}
    except Exception:  # noqa: BLE001 — config must never break billing math
        cfg = {}
    return cfg


def trial_enabled() -> bool:
    return bool(trial_config().get("enabled", True))


def trial_days() -> int:
    try:
        return max(1, int(trial_config().get("days", DEFAULT_TRIAL_DAYS)))
    except (TypeError, ValueError):
        return DEFAULT_TRIAL_DAYS


def min_request_credits() -> int:
    """The minimum a request can cost (before token-based additions)."""
    try:
        cfg = load_config().get("ai", {}) or {}
        return max(1, int(cfg.get("credits_per_request", 1)))
    except Exception:  # noqa: BLE001
        return 1


# ---------------------------------------------------------------------------
# Periods
# ---------------------------------------------------------------------------

def month_bounds(today: Optional[dt.date] = None) -> tuple[dt.datetime, dt.datetime]:
    """[start, end) of the calendar month containing `today`."""
    today = today or dt.date.today()
    start = dt.datetime.combine(today.replace(day=1), dt.time.min)
    if today.month == 12:
        nxt = dt.date(today.year + 1, 1, 1)
    else:
        nxt = dt.date(today.year, today.month + 1, 1)
    end = dt.datetime.combine(nxt, dt.time.min)
    return start, end


# ---------------------------------------------------------------------------
# Subscription state
# ---------------------------------------------------------------------------

async def get_or_create_subscription(db, business: Business) -> Subscription:
    """Every business has exactly one subscription (free until upgraded)."""
    sub = (await db.execute(
        select(Subscription).where(Subscription.business_id == business.id)
    )).scalars().first()
    if sub is None:
        sub = Subscription(business_id=business.id, plan=PLAN_FREE, status="active")
        db.add(sub)
        await db.flush()
    return sub


# ---------------------------------------------------------------------------
# Free trial
#
# The trial is a *window*, never a mutation of ``plan``. The effective plan
# is a pure function of (plan, trial_plan, trial_ends_at, now), so expiry is
# evaluated lazily on every read: there is no scheduler to miss, and a
# business whose trial lapsed while the server was down is correctly back on
# its base plan the next time anyone looks.
# ---------------------------------------------------------------------------

class TrialError(ValueError):
    """A trial cannot be started (already used, ineligible plan, disabled)."""


class TrialLockedError(ValueError):
    """A started trial is running and cannot be cancelled before it ends."""


class PaymentRequired(ValueError):
    """A paid plan was requested without going through the paid checkout."""


def _now() -> dt.datetime:
    return dt.datetime.utcnow()


def trial_is_active(sub: Subscription, now: Optional[dt.datetime] = None) -> bool:
    if not sub.trial_plan or not sub.trial_ends_at:
        return False
    return (now or _now()) < sub.trial_ends_at


def trial_was_used(sub: Subscription) -> bool:
    """A trial is one-per-business, for its whole lifetime."""
    return sub.trial_started_at is not None


def effective_plan(sub: Subscription, now: Optional[dt.datetime] = None) -> str:
    """The plan whose allowance and features actually apply right now.

    Precedence: an unexpired licence (a real grant) > an active free trial >
    the plan the business owns. All three are pure functions of the row and
    the clock, so nothing needs a scheduler to expire.
    """
    if license_is_active(sub, now):
        return sub.license_plan or sub.plan
    if trial_is_active(sub, now):
        return sub.trial_plan or sub.plan
    return sub.plan


def license_is_active(sub: Subscription, now: Optional[dt.datetime] = None) -> bool:
    """True while an activated licence is inside its window.

    ``license_ends_at IS NULL`` means perpetual (a key minted with no expiry).
    Revocation clears the window on the subscription, so a revoked licence
    stops granting the moment the team revokes it — no cache to invalidate.
    """
    if not sub.license_plan:
        return False
    if sub.license_ends_at is None:
        return True
    return (now or _now()) < sub.license_ends_at


def license_days_remaining(sub: Subscription, now: Optional[dt.datetime] = None) -> int:
    """Whole days left on the licence, rounded up — 0 once expired."""
    if not license_is_active(sub, now) or sub.license_ends_at is None:
        return 0
    delta = sub.license_ends_at - (now or _now())
    return max(0, math.ceil(delta.total_seconds() / 86400))


def license_state(sub: Subscription, now: Optional[dt.datetime] = None) -> dict[str, Any]:
    """The licence block the UI renders — honest in one place."""
    licensed = bool(sub.license_plan)
    active = license_is_active(sub, now) if licensed else False
    return {
        "licensed": licensed,
        "active": active,
        "plan": sub.license_plan if licensed else None,
        "label": plan_label(sub.license_plan) if licensed else None,
        "seats": sub.license_seats if licensed else None,
        "started_at": sub.license_started_at.isoformat() if sub.license_started_at else None,
        "ends_at": sub.license_ends_at.isoformat() if sub.license_ends_at else None,
        "days_remaining": license_days_remaining(sub, now),
        "fingerprint": sub.license_fingerprint if licensed else None,
        # True exactly once the window has closed (or the key was revoked),
        # so the UI can say "your licence ended" instead of silently reverting.
        "expired": licensed and not active,
    }


def trial_days_remaining(sub: Subscription, now: Optional[dt.datetime] = None) -> int:
    """Whole days left, rounded up — 0 once expired.

    Rounded up so the last partial day still reads as "1 day left" rather
    than "0 days left" while the trial is genuinely still active.
    """
    if not trial_is_active(sub, now):
        return 0
    delta = (sub.trial_ends_at or _now()) - (now or _now())
    return max(0, math.ceil(delta.total_seconds() / 86400))


def trial_state(sub: Subscription, now: Optional[dt.datetime] = None) -> dict[str, Any]:
    """The trial block the UI renders — honest in one place."""
    active = trial_is_active(sub, now)
    used = trial_was_used(sub)
    return {
        "available": trial_enabled() and not used,
        "active": active,
        "used": used,
        # True exactly once the window has closed (so the UI can say
        # "your trial ended" instead of silently reverting).
        "expired": used and not active,
        "plan": sub.trial_plan,
        "label": plan_label(sub.trial_plan) if sub.trial_plan else None,
        "days": trial_days(),
        "days_remaining": trial_days_remaining(sub, now),
        "started_at": sub.trial_started_at.isoformat() if sub.trial_started_at else None,
        "ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
    }


async def start_trial(
    db, business: Business, plan: str, actor: Optional[str] = None
) -> Subscription:
    """Begin the one free trial this business is entitled to.

    Deliberately strict: a trial is a real grant of paid capability with no
    card on file, so every refusal is explicit rather than silently
    re-granting. The base ``plan`` is left untouched, which is what makes
    expiry a no-op instead of a downgrade job.
    """
    if not trial_enabled():
        raise TrialError("Free trials are not available.")
    plan = (plan or "").strip().lower()
    if plan not in TRIALABLE_PLANS:
        raise TrialError(f"plan must be one of: {', '.join(TRIALABLE_PLANS)}")
    sub = await get_or_create_subscription(db, business)
    if trial_was_used(sub):
        raise TrialError("This business has already used its free trial.")
    if sub.plan != PLAN_FREE:
        raise TrialError("A free trial is only available on the Free plan.")
    now = _now()
    sub.trial_plan = plan
    sub.trial_started_at = now
    sub.trial_ends_at = now + dt.timedelta(days=trial_days())
    sub.status = "trialing"
    sub.updated_by = actor or business.owner_id
    await db.flush()
    return sub


async def used_credits(db, business_id: int, start: dt.datetime, end: dt.datetime) -> int:
    """Credits consumed in [start, end) — straight from the AI ledger."""
    return int((await db.execute(
        select(func.coalesce(func.sum(AiUsage.credits_used), 0))
        .where(
            AiUsage.business_id == business_id,
            AiUsage.created_at >= start,
            AiUsage.created_at < end,
        )
    )).scalar() or 0)


@dataclass
class CreditState:
    plan: str
    label: str
    unlimited: bool
    granted: Optional[int]
    used: int
    remaining: Optional[int]
    period_start: str
    period_end: str
    # The plan the business owns, ignoring any trial grant.
    base_plan: str = PLAN_FREE
    trial: Optional[dict[str, Any]] = None
    license: Optional[dict[str, Any]] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            # ``plan`` is the EFFECTIVE plan (trial grant included) so every
            # existing consumer keeps enforcing/rendering the right thing.
            "plan": self.plan,
            "label": self.label,
            "unlimited": self.unlimited,
            "granted": self.granted,
            "used": self.used,
            "remaining": self.remaining,
            "period": {"start": self.period_start, "end": self.period_end},
            "base_plan": self.base_plan,
            "trial": self.trial,
            "license": self.license,
        }


async def credit_state(db, business: Business) -> CreditState:
    """The business's current credit position (computed, never stored)."""
    sub = await get_or_create_subscription(db, business)
    start, end = month_bounds()
    used = await used_credits(db, business.id, start, end)
    # A live trial grants the trialled plan's allowance; once the window
    # closes this silently resolves back to the base plan (no job needed).
    active_plan = effective_plan(sub)
    allowance = allowance_for(active_plan)
    unlimited = allowance is None
    remaining = None if unlimited else max(0, (allowance or 0) - used)
    return CreditState(
        plan=active_plan,
        label=plan_label(active_plan),
        unlimited=unlimited,
        granted=None if unlimited else (allowance or 0),
        used=used,
        remaining=remaining,
        period_start=start.date().isoformat(),
        period_end=(end - dt.timedelta(seconds=1)).date().isoformat(),
        base_plan=sub.plan,
        trial=trial_state(sub),
        license=license_state(sub),
    )


class InsufficientCredits(Exception):
    """Raised by the AI service when a request cannot be afforded.

    The route maps this to HTTP 402 with a structured body the UI renders
    as an honest 'out of credits' card (with a billing link) — never a
    silent failure.
    """

    def __init__(self, state: CreditState, required: int):
        self.state = state
        self.required = required

    def to_dict(self) -> dict[str, Any]:
        s = self.state
        return {
            "error": "insufficient_credits",
            "plan": s.plan,
            "granted": s.granted,
            "used": s.used,
            "remaining": s.remaining,
            "required": self.required,
            "trial": s.trial,
            "message": self._message(),
        }

    def _message(self) -> str:
        s = self.state
        trial = s.trial or {}
        if trial.get("expired"):
            # The most common way to hit 0 after a trial: say what actually
            # happened rather than blaming the free allowance.
            return (
                f"Your free trial has ended and you've used all {s.used} AI "
                f"credits on the {s.label} plan this month. Choose a plan to "
                f"keep asking Co-op."
            )
        return (
            f"You've used all {s.used} AI credits available on the "
            f"{s.label} plan this month. Upgrade your plan to keep "
            f"asking Co-op."
        )


async def check_credits(db, business: Business) -> CreditState:
    """Enforcement gate for AI requests.

    Admits the request when the minimum possible cost (base request
    credit) is affordable; the ACTUAL cost is recorded after the model
    runs, and a response that costs more than the remainder is allowed to
    complete (the ledger then shows 0 remaining). This keeps the gate
    simple and deterministic while the ledger stays exact.
    """
    state = await credit_state(db, business)
    if state.unlimited:
        return state
    if (state.remaining or 0) < min_request_credits():
        raise InsufficientCredits(state, min_request_credits())
    return state


# ---------------------------------------------------------------------------
# Plan changes (real state, no payment in this phase)
# ---------------------------------------------------------------------------

async def change_plan(
    db,
    business: Business,
    plan: str,
    actor: Optional[str] = None,
    via_payment: bool = False,
) -> Subscription:
    """Switch the business's plan.

    Rules once a payment provider is connected:

    * **A started trial cannot be cancelled.** It runs to ``trial_ends_at``;
      requesting ``free`` (a downgrade) while a trial is active is refused,
      so a trial never stops early. To keep the paid features afterwards the
      business pays.
    * **A paid plan must be paid for.** With Paystack configured the only path
      to a paid plan is the paid checkout (or a licence); a direct free switch
      is refused unless ``via_payment`` is set.

    When payment is not configured (testing, or before launch) the manual
    switch still works, so development stays usable. The new allowance applies
    for the whole current calendar month; usage keeps counting month-to-date
    (no proration — keep it explainable).
    """
    plan = (plan or "").strip().lower()
    if plan not in VALID_PLANS:
        raise InvalidPlan(f"plan must be one of: {', '.join(VALID_PLANS)}")
    sub = await get_or_create_subscription(db, business)

    if trial_is_active(sub) and plan == PLAN_FREE and not via_payment:
        raise TrialLockedError(
            "Your trial runs until it ends and cannot be cancelled early. "
            "When it is over you can subscribe to keep the paid features."
        )

    if plan != PLAN_FREE and not via_payment and paystack_is_configured():
        raise PaymentRequired(
            f"{plan_label(plan)} is a paid plan — use the paid checkout. "
            "A free switch is only available before a payment provider exists."
        )

    sub.plan = plan
    sub.status = "active"
    # Leaving a live trial now only happens by paying (or a licence grant):
    # the business owns the new plan, so the trial window is closed and kept
    # as billing history. It can never be closed by a free switch.
    if trial_is_active(sub) and via_payment:
        sub.trial_ends_at = _now()
    sub.updated_by = actor or business.owner_id
    await db.flush()
    return sub


async def billing_summary(db, business: Business) -> dict[str, Any]:
    """GET /billing/summary — plan + credits + the month's metered usage."""
    state = await credit_state(db, business)
    start, end = month_bounds()
    usage = (await db.execute(
        select(
            func.count(AiUsage.id),
            func.coalesce(func.sum(AiUsage.input_tokens), 0),
            func.coalesce(func.sum(AiUsage.output_tokens), 0),
        ).where(
            AiUsage.business_id == business.id,
            AiUsage.created_at >= start,
            AiUsage.created_at < end,
        )
    )).one()
    return {
        **state.to_dict(),
        "business_id": business.id,
        "plans": [
            {
                "key": p,
                "label": plan_label(p),
                "credits_per_month": allowance_for(p),
                "trialable": p in TRIALABLE_PLANS,
            }
            for p in VALID_PLANS
        ],
        "trial_days": trial_days(),
        "usage_month": {
            "requests": int(usage[0] or 0),
            "input_tokens": int(usage[1] or 0),
            "output_tokens": int(usage[2] or 0),
            "credits_used": state.used,
        },
        # Real: payments go through Paystack when it is configured
        # (paystack.enabled + a payment page or PAYSTACK_SECRET_KEY).
        "payment_connected": paystack_is_configured(),
    }
