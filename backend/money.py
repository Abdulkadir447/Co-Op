"""Exact money — one representation, enforced at the database boundary.

The bug this closes: every money column used to be a ``Float``. In SQLite a
``REAL`` is an IEEE double, so ``0.1 + 0.2`` is not ``0.3`` and a thousand
line items accumulate a drift that shows up as one kobo — or, once VAT is
computed on the drifted subtotal, as a whole naira that an accountant cannot
reconcile. A ledger that is *nearly* right is a ledger nobody trusts.

The rule, and there are no exceptions to it:

  * **Money is stored as an integer number of minor units** (kobo) in an
    ``INTEGER`` column. An integer cannot drift.
  * **Python sees ``decimal.Decimal``**, not ``float``. Decimal arithmetic on
    two-place values is exact, and mixing it with a ``float`` raises
    ``TypeError`` — which is the point: the one place a float could sneak into
    a total is the place the interpreter refuses to let it.
  * **Rounding happens once, at a named boundary**, with
    ``ROUND_HALF_UP`` — the commercial convention ("round half away from
    zero"), not Python's default banker's rounding, which would round
    ``₦0.125`` to ``₦0.12`` and surprise a cashier.

Two column types carry this:

  ``Money``  — minor units, 2 decimal places. Naira, and 99% of currencies.
  ``Rate``   — a *percentage* with 4 decimal places, stored as millionths of
               a percent (7.5% -> 7_500_000 is 4dp at scale 1e4: 75_000).
               Rates are not money, but a rate that drifts reprices tax, so
               it gets the same treatment.

`CURRENCY` and `MINOR_UNITS` are fixed for this edition. A currency with a
different exponent (JPY has zero, KWD three) would silently break the scale, so
the business's currency is constrained to NGN at the database level rather than
being a free-text field somebody edits.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Iterable, Optional

from sqlalchemy import Integer
from sqlalchemy.types import TypeDecorator

#: The only currency this edition supports. Naira, two decimal places.
CURRENCY = "NGN"

#: Decimal places of the minor unit. Fixed by CURRENCY, not by configuration.
MINOR_UNITS = 2

#: 1 naira == 100 kobo.
SCALE = 10 ** MINOR_UNITS

#: Rate precision: 4 decimal places of a percent.
RATE_SCALE = 10_000

#: How the currency is written in text the server itself produces (notifications,
#: briefings, AI prompts). The UI formats on the client; this is for strings.
SYMBOL = "\u20a6"

ZERO = Decimal("0.00")

#: "Settled" tolerance — half a kobo. Not drift-hiding: money is exact, but a
#: grand total is rounded once (net + tax), so a tax that rounds up must not
#: leave an order looking one kobo short forever.
EPSILON = Decimal("0.005")
ONE_HUNDRED = Decimal("100")

_Q = Decimal("0.01")
_Q_RATE = Decimal("0.0001")


def to_decimal(value: Any) -> Decimal:
    """Coerce anything numeric to Decimal without going through binary float.

    ``Decimal(0.1)`` is ``0.1000000000000000055511151231257827...``; the float
    has to be printed first (``Decimal(str(...))``) to get the value the caller
    meant. ``None`` is zero, because a missing price in a total is not an
    error — the column is nullable and the arithmetic still has to work.
    """
    if value is None:
        return ZERO
    if isinstance(value, Decimal):
        return value
    if isinstance(value, bool):
        raise TypeError("money cannot be a boolean")
    if isinstance(value, int):
        return Decimal(value)
    if isinstance(value, float):
        return Decimal(str(value))
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:  # pragma: no cover - defensive
        raise TypeError(f"not a money value: {value!r}") from exc


def as_money(value: Any) -> Decimal:
    """Quantize to the currency's minor unit, half-up. The only rounding."""
    return to_decimal(value).quantize(_Q, rounding=ROUND_HALF_UP)


def as_rate(value: Any) -> Optional[Decimal]:
    """Quantize a percentage to 4dp. ``None`` stays ``None`` (tax was off)."""
    if value is None:
        return None
    return to_decimal(value).quantize(_Q_RATE, rounding=ROUND_HALF_UP)


def to_minor(value: Any) -> Optional[int]:
    """Money -> integer kobo. Exactly what the database stores."""
    if value is None:
        return None
    return int((as_money(value) * SCALE).to_integral_value())


def from_minor(value: Optional[int]) -> Optional[Decimal]:
    """Integer kobo -> money. Exactly what Python sees."""
    if value is None:
        return None
    return (Decimal(int(value)) / SCALE).quantize(_Q)


def sum_money(values: Iterable[Any]) -> Decimal:
    """Add money without leaving Decimal arithmetic."""
    total = ZERO
    for v in values:
        total += as_money(v)
    return as_money(total)


def percent_of(amount: Any, rate: Any) -> Decimal:
    """Tax on an amount, rounded once.

    ``amount * rate / 100`` stays in Decimal throughout; the single quantize is
    the only rounding, so two calls with the same inputs cannot disagree.
    """
    if rate is None:
        return ZERO
    return as_money(to_decimal(amount) * to_decimal(rate) / ONE_HUNDRED)


def fmt(value: Any, *, decimals: int = 2, symbol: str = SYMBOL) -> str:
    """Money as a string a person reads: ``₦1,234.50``.

    Grouping and the 0/2-decimal rule are here so every server-produced string
    (an email, a briefing line) formats the same way the UI does.
    """
    amount = as_money(value)
    if decimals == 0:
        return f"{symbol}{amount:,.0f}"
    return f"{symbol}{amount:,.2f}"


def fmt_compact(value: Any, *, symbol: str = SYMBOL) -> str:
    """Whole naira when the amount is round, otherwise kobo."""
    amount = as_money(value)
    if amount == amount.to_integral_value():
        return f"{symbol}{amount:,.0f}"
    return f"{symbol}{amount:,.2f}"


def json_default(obj: Any) -> Any:
    """``json.dumps(..., default=money_mod.json_default)`` for Decimal payloads.

    JSON has no decimal type. A Decimal becomes a number with the same value
    (``19.99``), not a string — the consumer of these payloads is a model or a
    spreadsheet, not an exactness-critical ledger path. Anything else is a real
    bug and must not be silently stringified.
    """
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")


def jsonable(obj: Any) -> Any:
    """Recursively convert Decimal -> float for a JSON response body.

    The database and all arithmetic stay exact (Decimal / integer minor units).
    Only the response body is naira as a JSON number, because that is what the
    UI already reads and changing the wire shape would rewrite every screen for
    no gain. Money is display-only on the client: any number the app must act
    on is recomputed server-side.
    """
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, dict):
        return {k: jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [jsonable(v) for v in obj]
    return obj


class Money(TypeDecorator):
    """An ``INTEGER`` column of minor units that Python sees as ``Decimal``.

    ``cache_ok`` matters: without it SQLAlchemy disables the statement cache for
    every query touching a money column.
    """

    impl = Integer
    cache_ok = True

    def process_bind_param(self, value, dialect):  # noqa: ARG002 - signature is SQLAlchemy's
        return to_minor(value)

    def process_result_value(self, value, dialect):  # noqa: ARG002
        return from_minor(value)


class Rate(TypeDecorator):
    """An ``INTEGER`` column of millionths of a percent, seen as ``Decimal``.

    7.5% is stored as ``75000`` (7.5 x 10_000). Four decimal places is more
    resolution than any VAT or sales-tax rate needs and keeps the value an
    integer, so a rate can never arrive as ``7.499999999``.
    """

    impl = Integer
    cache_ok = True

    def process_bind_param(self, value, dialect):  # noqa: ARG002
        if value is None:
            return None
        rate = as_rate(value)
        return int((rate * RATE_SCALE).to_integral_value())

    def process_result_value(self, value, dialect):  # noqa: ARG002
        if value is None:
            return None
        return (Decimal(int(value)) / RATE_SCALE).quantize(_Q_RATE)
