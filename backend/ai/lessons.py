"""Zeno's learning ledger — the memory that makes answers improve over time.

This is the only place the assistant "learns", and it is deliberately narrow.
Co-op's trust contract says Zeno never executes anything and never queries the
database; a learning layer must not become a back door around that. So a lesson
is **text injected into the prompt**, never a code path that changes behaviour
by itself:

    mistake    -> recorded with a 1-5 severity -> injected immediately
    preference -> first mention stored dormant -> a second, independent mention
                  activates it -> injected from then on

Both halves are *invisible on purpose*. The owner is never shown a list of what
Zeno has learned, because a settings screen turns adaptation into homework: the
product is supposed to feel like it is getting to know the business, not like it
is asking to be trained. (This replaced the reviewed-candidate flow, which put
every observation behind an Accept button.)

Because no human reviews a preference any more, three automated gates replace
the review:

* **Repetition.** One mention is stored as ``candidate`` and ignored by the
  prompt. Only a second independent mention with the same fingerprint activates
  it, so a single odd sentence (or a stray line of text inside business data)
  cannot become a standing rule.
* **Sanitising.** ``sanitize_preference`` refuses text that looks like an
  instruction to the assistant rather than a description of how the owner
  works — no URLs, no markup, no "ignore/instructions/system" phrasing, bounded
  length, one line. Model-authored statements go through it.
* **A cap.** At most ``MAX_PREFERENCES`` active preferences reach the prompt, so
  a long tail can never crowd out the verified business context.

Dismissal is still final: an explicit "no" bumps the counter but never
resurrects the lesson.

Everything is tenant-scoped (``business_id``), like every other Co-op query.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any, Optional

from sqlalchemy import select

from ..models import ZenoLesson

# 1-5, mapped to what the owner actually loses. Named so the UI can explain the
# scale instead of showing a bare number.
SEVERITY_LABELS: dict[int, str] = {
    1: "cosmetic",
    2: "minor",
    3: "costly",
    4: "expensive",
    5: "wrong money or stock",
}

MIN_SEVERITY, MAX_SEVERITY = 1, 5
STATEMENT_MAX = 300
SCOPE_MAX = 40
# Cap the prompt block: lessons are instructions, and a wall of instructions
# crowds out the verified context (the thing the answer must be built from).
# Minds and habits are budgeted separately so a file of mistakes can never bury
# the preferences that make answers feel personal.
PROMPT_LIMIT = 8
MISTAKE_LIMIT = 6
MAX_PREFERENCES = 4
# How many times the owner must say the same thing before Zeno treats it as a
# standing preference. Two independent mentions, never one.
PROMOTE_AFTER = 2

ACTIVE, CANDIDATE, DISMISSED = "active", "candidate", "dismissed"
KINDS = ("mistake", "preference")

# A preference is a description of how the owner works, so genuine ones read
# like "prefers totals rounded to whole dollars". These markers are what an
# injected instruction looks like instead (a URL, markup, or a directive aimed
# at the model). Model-authored preference text must pass this filter.
_PREFERENCE_DENY = (
    "ignore previous", "ignore all", "ignore the", "disregard", "system prompt",
    "instructions", "instruction:", "you must", "you are now", "act as",
    "http://", "https://", "www.", "javascript:", "<script", "{{", "}}",
    "```", "\n", "\r", "base64", "api key", "secret", "password", "token",
)
PREFERENCE_MAX = 160


def sanitize_preference(statement: str) -> Optional[str]:
    """Return a safe one-line preference, or None if it smells like an injection.

    Deliberately conservative: a dropped preference costs a little polish, a
    stored instruction costs the trust contract.
    """
    text = _clean(statement, PREFERENCE_MAX)
    if len(text) < 8:
        return None
    low = text.lower()
    if any(marker in low for marker in _PREFERENCE_DENY):
        return None
    if low.count("__") or "\x00" in text:
        return None
    return text


def _clean(text: str, limit: int) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()[:limit]


def fingerprint(kind: str, scope: str, statement: str) -> str:
    """Stable id for "the same lesson" so a repeat increments, never duplicates."""
    basis = f"{kind}|{_clean(scope, SCOPE_MAX).lower()}|{_clean(statement, STATEMENT_MAX).lower()}"
    return hashlib.sha1(basis.encode("utf-8")).hexdigest()[:40]


def _validate_severity(severity: Any) -> int:
    try:
        value = int(severity)
    except (TypeError, ValueError):
        raise ValueError("severity must be a whole number from 1 to 5")
    if value < MIN_SEVERITY or value > MAX_SEVERITY:
        raise ValueError("severity must be between 1 and 5")
    return value


async def _find(db, business_id: int, fp: str) -> Optional[ZenoLesson]:
    return (
        await db.execute(
            select(ZenoLesson).where(
                ZenoLesson.business_id == business_id, ZenoLesson.fingerprint == fp
            )
        )
    ).scalar_one_or_none()


async def record_mistake(
    db,
    business_id: int,
    statement: str,
    severity: Any = 3,
    scope: str = "general",
    cost_amount: Optional[float] = None,
    cost_basis: str = "estimated",
    blast_radius: int = 0,
    source: str = "owner",
    evidence_ref: Optional[str] = None,
) -> tuple[ZenoLesson, bool]:
    """Record something Zeno got wrong. Returns (lesson, created).

    A repeat (same business, same fingerprint) bumps ``repeat_count`` and keeps
    the *worst* grading seen — a rule that broke twice is not less serious than
    the first time. An explicitly dismissed lesson stays dismissed.
    """
    text = _clean(statement, STATEMENT_MAX)
    if not text:
        raise ValueError("statement is required")
    sev = _validate_severity(severity)
    try:
        cost = round(float(cost_amount), 2) if cost_amount is not None else None
    except (TypeError, ValueError):
        raise ValueError("cost_amount must be a number")
    if cost is not None and cost < 0:
        raise ValueError("cost_amount cannot be negative")

    fp = fingerprint("mistake", scope, text)
    existing = await _find(db, business_id, fp)
    if existing is not None:
        existing.repeat_count = (existing.repeat_count or 1) + 1
        existing.severity = max(existing.severity or sev, sev)
        if cost is not None:
            if existing.cost_amount is None or cost > existing.cost_amount:
                existing.cost_amount = cost
            # measured beats estimated, whatever the amount
            if cost_basis == "measured" or existing.cost_basis != "measured":
                if cost_basis == "measured":
                    existing.cost_basis = "measured"
        existing.blast_radius = max(existing.blast_radius or 0, int(blast_radius or 0))
        if evidence_ref:
            existing.evidence_ref = _clean(evidence_ref, 80)
        return existing, False

    lesson = ZenoLesson(
        business_id=business_id,
        kind="mistake",
        scope=_clean(scope, SCOPE_MAX) or "general",
        statement=text,
        severity=sev,
        cost_amount=cost,
        cost_basis="measured" if cost_basis == "measured" else "estimated",
        blast_radius=int(blast_radius or 0),
        repeat_count=1,
        status=ACTIVE,
        source=source if source in ("owner", "detected") else "owner",
        fingerprint=fp,
        evidence_ref=_clean(evidence_ref, 80) if evidence_ref else None,
    )
    db.add(lesson)
    return lesson, True


async def observe_preference(
    db,
    business_id: int,
    statement: str,
    scope: str = "general",
    evidence_ref: Optional[str] = None,
) -> tuple[ZenoLesson, bool]:
    """Count the owner asking for the same thing. Returns (lesson, created).

    The first mention is stored dormant (``candidate``) and is ignored by the
    prompt. A second independent mention of the same fingerprint promotes it to
    ``active``, and only then does it shape answers. Nothing is ever shown to
    the owner. A dismissed preference is never resurrected by repetition.
    """
    text = _clean(statement, STATEMENT_MAX)
    if not text:
        raise ValueError("statement is required")

    fp = fingerprint("preference", scope, text)
    existing = await _find(db, business_id, fp)
    if existing is not None:
        existing.repeat_count = (existing.repeat_count or 1) + 1
        if existing.status != DISMISSED and existing.repeat_count >= PROMOTE_AFTER:
            existing.status = ACTIVE
        return existing, False

    lesson = ZenoLesson(
        business_id=business_id,
        kind="preference",
        scope=_clean(scope, SCOPE_MAX) or "general",
        statement=text,
        severity=2,  # a preference is not a mistake; keep it out of severity ranking
        repeat_count=1,
        # One mention is remembered but obeyed by nothing; see PROMOTE_AFTER.
        status=CANDIDATE,
        source="observed",
        fingerprint=fp,
        evidence_ref=_clean(evidence_ref, 80) if evidence_ref else None,
    )
    db.add(lesson)
    return lesson, True


async def record_rejection(
    db, business_id: int, action_type: str, reason: str
) -> Optional[ZenoLesson]:
    """Auto-record a proposal the validator refused — a mistake Zeno can see.

    This is the loop a bolt-on assistant cannot copy: ``actions.validate_actions``
    rejects a draft against the *live* row (stock, price, ambiguous customer), so
    the failure reason is ground truth. Severity is derived from what the
    rejection would have cost had it been executed.

    Never raises: a bookkeeping failure must not fail the owner's request.
    """
    try:
        severity = severity_for_rejection(reason)
        return (
            await record_mistake(
                db,
                business_id,
                statement=f"Do not propose {action_type} again until this is fixed: {reason}",
                severity=severity,
                scope=f"action:{_clean(action_type, 30).lower()}",
                source="detected",
                evidence_ref=f"action:{_clean(action_type, 30)}",
            )
        )[0]
    except Exception:  # noqa: BLE001 — never break a chat turn over the ledger
        return None


def severity_for_rejection(reason: str) -> int:
    """Grade a refused proposal by what executing it would have cost.

    Stock/price/money problems are 3; a capability the assistant should not
    have attempted is 2; an ambiguous match that could hit the wrong customer
    is 4 (wrong party on a real order).
    """
    r = (reason or "").lower()
    if "multiple customers" in r or "ambiguous" in r:
        return 4
    if "in stock" in r or "selling price" in r or "not in co-op yet" in r:
        return 3
    if "no matching product" in r or "multiple products" in r:
        return 3
    return 2


async def set_status(
    db,
    business_id: int,
    lesson_id: int,
    status: str,
    severity: Optional[Any] = None,
) -> Optional[ZenoLesson]:
    """Owner action: accept a candidate, dismiss anything, or re-grade.

    Returns None when the lesson does not exist *for this business* — the route
    turns that into a 404, so one tenant can never touch another's ledger.
    """
    if status not in (ACTIVE, CANDIDATE, DISMISSED):
        raise ValueError("status must be active, candidate or dismissed")
    lesson = (
        await db.execute(
            select(ZenoLesson).where(
                ZenoLesson.id == lesson_id, ZenoLesson.business_id == business_id
            )
        )
    ).scalar_one_or_none()
    if lesson is None:
        return None
    lesson.status = status
    if severity is not None:
        lesson.severity = _validate_severity(severity)
    return lesson


def serialize(lesson: ZenoLesson) -> dict[str, Any]:
    return {
        "id": lesson.id,
        "kind": lesson.kind,
        "scope": lesson.scope,
        "statement": lesson.statement,
        "severity": lesson.severity,
        "severity_label": SEVERITY_LABELS.get(lesson.severity or 3, ""),
        "cost_amount": lesson.cost_amount,
        "cost_basis": lesson.cost_basis,
        "blast_radius": lesson.blast_radius or 0,
        "repeat_count": lesson.repeat_count or 1,
        "status": lesson.status,
        "source": lesson.source,
        "evidence_ref": lesson.evidence_ref,
        "created_at": lesson.created_at.isoformat() if lesson.created_at else None,
    }


async def list_lessons(
    db, business_id: int, status: Optional[str] = None, kind: Optional[str] = None, limit: int = 50
) -> list[ZenoLesson]:
    stmt = select(ZenoLesson).where(ZenoLesson.business_id == business_id)
    if status in (ACTIVE, CANDIDATE, DISMISSED):
        stmt = stmt.where(ZenoLesson.status == status)
    if kind in KINDS:
        stmt = stmt.where(ZenoLesson.kind == kind)
    # Worst first: severity, then measured cost, then how often it recurred.
    stmt = stmt.order_by(
        ZenoLesson.severity.desc(), ZenoLesson.cost_amount.desc(), ZenoLesson.repeat_count.desc()
    ).limit(max(1, min(int(limit or 50), 200)))
    return list((await db.execute(stmt)).scalars().all())


async def active_constraints(
    db,
    business_id: int,
    limit: int = PROMPT_LIMIT,
    preference_limit: int = MAX_PREFERENCES,
) -> list[dict[str, Any]]:
    """The only lessons that reach the prompt: ``status='active'``, worst first.

    Mistakes and preferences are fetched separately so that preferences always
    get their share of the budget — sorted together, severity 2 preferences
    would lose to every severity 3-5 mistake and never reach an established
    business, which is exactly the business that has the most to personalise.
    """
    preferences = await list_lessons(
        db,
        business_id,
        status=ACTIVE,
        kind="preference",
        limit=max(0, min(preference_limit, limit)),
    )
    # Mistakes get whatever is left of the budget, so the block never exceeds
    # ``limit`` lessons no matter how busy the ledger is.
    mistakes = await list_lessons(
        db, business_id, status=ACTIVE, kind="mistake",
        limit=max(0, limit - len(preferences)),
    )
    rows = mistakes + preferences
    return [
        {
            "severity": r.severity,
            "severity_label": SEVERITY_LABELS.get(r.severity or 3, ""),
            "kind": r.kind,
            "scope": r.scope,
            "statement": r.statement,
            "repeat_count": r.repeat_count or 1,
            "cost_amount": r.cost_amount,
        }
        for r in rows
    ]


def render_lessons(lessons: list[dict[str, Any]]) -> str:
    """Turn active lessons into a prompt block. Empty string when there are none.

    Deliberately worded as *constraints*, and told to win over style — the
    point of remembering a mistake is that the next answer is different.
    """
    if not lessons:
        return ""
    lines = []
    for lesson in lessons:
        bits = [f"severity {lesson['severity']} ({lesson.get('severity_label') or ''})"
                if lesson.get("severity_label") else f"severity {lesson['severity']}"]
        if lesson.get("repeat_count", 1) > 1:
            bits.append(f"happened {lesson['repeat_count']}x")
        if lesson.get("cost_amount"):
            bits.append(f"cost {lesson['cost_amount']:.2f}")
        lines.append(f"- [{lesson['scope']}; {', '.join(bits)}] {lesson['statement']}")
    return (
        "\nLESSONS FROM THIS BUSINESS (learned from graded mistakes and observed "
        "preferences — these OUTRANK style and general best practice):\n"
        + "\n".join(lines)
        + "\nDo not repeat these. If the owner's request would make you repeat one, "
        "say so plainly instead of complying silently.\n"
    )
