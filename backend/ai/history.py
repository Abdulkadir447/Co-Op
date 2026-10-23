"""AI history (AI Platform phase — "AI history" deliverable).

The OWNER-VISIBLE record of what Zeno answered: one row per completed
/ai/chat turn (question + answered kind/title + short summary + model +
credits). ``ai_usage`` stays the cost meter; this is the activity ledger
the UI's "AI activity" panel reads.

Rules:
  * only COMPLETED turns are recorded (assistant answers and grounded
    clarify answers) — a request that failed with 503 never lands here,
    so the history never claims an answer that wasn't given;
  * strictly tenant-scoped (business_id), like every other Co-op query;
  * listing is newest-first with pagination; clearing is an explicit
    owner action and only ever removes the caller's own rows.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import delete, func, select

from ..models import AiHistory

SUMMARY_MAX = 400  # full answers live in the conversation, not the ledger


def _clamp(value: Optional[int], default: int, lo: int, hi: int) -> int:
    try:
        v = int(value) if value is not None else default
    except (TypeError, ValueError):
        v = default
    return max(lo, min(hi, v))


async def record_turn(
    db,
    business_id: int,
    user_id: Optional[str],
    question: str,
    answer: dict[str, Any],
    request_id: Optional[str] = None,
    report_key: Optional[str] = None,
) -> None:
    """Record one completed AI turn. Added to the caller's session; the
    request's commit makes it durable (and a rolled-back request records
    nothing — consistent with the usage ledger)."""
    db.add(
        AiHistory(
            business_id=business_id,
            user_id=user_id,
            request_id=(request_id or "")[:64] or None,
            question=(question or "")[:1000],
            answer_kind=str(answer.get("kind") or "")[:20] or None,
            answer_title=str(answer.get("title") or "")[:255] or None,
            answer_summary=str(answer.get("message") or "")[:SUMMARY_MAX] or None,
            report_key=str(report_key or "")[:20] or None,
            model=str(answer.get("model") or "")[:64] or None,
            credits_used=int(answer.get("credits_used") or 0),
        )
    )


async def list_history(
    db, business_id: int, limit: int = 30, offset: int = 0
) -> tuple[list[dict[str, Any]], int]:
    """Newest-first page of the business's AI activity. Returns (items, total)."""
    limit = _clamp(limit, 30, 1, 200)
    offset = _clamp(offset, 0, 0, 1_000_000)

    total = (
        await db.execute(
            select(func.count(AiHistory.id)).where(AiHistory.business_id == business_id)
        )
    ).scalar() or 0

    rows = (
        (
            await db.execute(
                select(AiHistory)
                .where(AiHistory.business_id == business_id)
                .order_by(AiHistory.created_at.desc(), AiHistory.id.desc())
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )

    items = [
        {
            "id": r.id,
            "question": r.question,
            "answer_kind": r.answer_kind,
            "answer_title": r.answer_title,
            "answer_summary": r.answer_summary,
            "report_key": r.report_key,
            "model": r.model,
            "credits_used": r.credits_used or 0,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return items, int(total)


async def clear_history(db, business_id: int) -> int:
    """Delete the business's AI activity. Returns the number of rows removed."""
    result = await db.execute(delete(AiHistory).where(AiHistory.business_id == business_id))
    return result.rowcount or 0
