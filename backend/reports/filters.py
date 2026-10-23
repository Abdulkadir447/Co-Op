"""One filter contract for every report, export and AI explanation.

Reports UI, CSV/XLSX/PDF exports and the AI context builder all consume the
SAME ``ReportFilters`` -> the same computed dataset. One calculation engine,
one filter contract — so the screen, the export and the AI can never
disagree about a number.

    GET /reports/sales?from=2026-01-01&to=2026-08-28&compare=previous_period
                              &category=Electronics&product_id=7&customer_id=3
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Optional


class FilterError(ValueError):
    """Raised when query filters are invalid (route turns this into 422)."""


def fmt_short_date(d: dt.date) -> str:
    """'Sep 2' — built from components because '%b %-d' is not portable:
    Windows raises ValueError on the '%-d' (no zero padding) directive."""
    return f"{d:%b} {d.day}"


def fmt_full_date(d: dt.date) -> str:
    """'Sep 2, 2026' — portable equivalent of '%b %-d, %Y' (see above)."""
    return f"{d:%b} {d.day}, {d.year}"


COMPARE_NONE = "none"
COMPARE_PREVIOUS_PERIOD = "previous_period"  # equal-length window ending the day before `from`
COMPARE_PREVIOUS_MONTH = "previous_month"    # previous calendar month (for "this month" ranges)
COMPARE_PREVIOUS_YEAR = "previous_year"      # same window shifted one year earlier

VALID_COMPARES = (
    COMPARE_NONE,
    COMPARE_PREVIOUS_PERIOD,
    COMPARE_PREVIOUS_MONTH,
    COMPARE_PREVIOUS_YEAR,
)


@dataclass(frozen=True)
class ReportFilters:
    from_date: dt.date
    to_date: dt.date
    compare: str = COMPARE_NONE
    category: Optional[str] = None
    product_id: Optional[int] = None
    customer_id: Optional[int] = None

    @classmethod
    def from_query(
        cls,
        from_str: Optional[str] = None,
        to_str: Optional[str] = None,
        compare: Optional[str] = None,
        category: Optional[str] = None,
        product_id: Optional[int] = None,
        customer_id: Optional[int] = None,
    ) -> "ReportFilters":
        today = dt.date.today()
        to = _parse_date(to_str) or today
        # default: last 30 days incl. today
        from_ = _parse_date(from_str) or (to - dt.timedelta(days=29))
        if from_ > to:
            raise FilterError("'from' must be on or before 'to'.")
        span_days = (to - from_).days
        if span_days > 730:
            raise FilterError("Report range is limited to 2 years.")
        compare = (compare or COMPARE_NONE).strip().lower()
        if compare not in VALID_COMPARES:
            raise FilterError(f"compare must be one of: {', '.join(VALID_COMPARES)}")
        category = (category or "").strip() or None
        return cls(
            from_date=from_,
            to_date=to,
            compare=compare,
            category=category,
            product_id=product_id,
            customer_id=customer_id,
        )

    @property
    def span_days(self) -> int:
        return (self.to_date - self.from_date).days + 1

    def previous_range(self) -> Optional[tuple[dt.date, dt.date]]:
        """The comparison window, or None when compare is 'none'."""
        if self.compare == COMPARE_NONE:
            return None
        if self.compare == COMPARE_PREVIOUS_PERIOD:
            end = self.from_date - dt.timedelta(days=1)
            return (end - dt.timedelta(days=self.span_days - 1), end)
        if self.compare == COMPARE_PREVIOUS_MONTH:
            first_this = self.to_date.replace(day=1)
            last_prev = first_this - dt.timedelta(days=1)
            return (last_prev.replace(day=1), last_prev)
        # previous_year: same window shifted back one year (Feb 29 -> Feb 28).
        try:
            return (
                self.from_date.replace(year=self.from_date.year - 1),
                self.to_date.replace(year=self.to_date.year - 1),
            )
        except ValueError:
            shifted_to = self.to_date.replace(year=self.to_date.year - 1, day=28)
            return (self.from_date.replace(year=self.from_date.year - 1), shifted_to)

    def describe(self) -> str:
        parts = [self.period_label]
        if self.category:
            parts.append(f"Category: {self.category}")
        if self.product_id:
            parts.append(f"Product #{self.product_id}")
        if self.customer_id:
            parts.append(f"Customer #{self.customer_id}")
        if self.compare != COMPARE_NONE:
            parts.append(f"Compared with: {self.compare.replace('_', ' ')}")
        return " · ".join(parts)

    @property
    def period_label(self) -> str:
        return f"{fmt_full_date(self.from_date)} – {fmt_full_date(self.to_date)}"

    def to_query_dict(self) -> dict:
        """Compact, AI/URL-safe representation of the applied filters."""
        return {
            "from": self.from_date.isoformat(),
            "to": self.to_date.isoformat(),
            "compare": self.compare,
            "category": self.category,
            "product_id": self.product_id,
            "customer_id": self.customer_id,
        }


def _parse_date(s: Optional[str]) -> Optional[dt.date]:
    if not s:
        return None
    try:
        return dt.date.fromisoformat(s.strip()[:10])
    except ValueError:
        raise FilterError(f"Invalid date {s!r} — use YYYY-MM-DD.")
