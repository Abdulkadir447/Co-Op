"""
CSV/spreadsheet formula injection defence.

A cell that begins with ``=``, ``+``, ``-`` or ``@`` is executed as a formula by
Excel, LibreOffice and Google Sheets. Product names, customer names and
categories are user-supplied and flow straight into exports, so a record named

    =cmd|'/c calc'!A1        =HYPERLINK("http://evil","click")        @SUM(A1)

becomes live code on the machine of whoever opens the file. This is the one
finding in docs/SECURITY_AUDIT.md that reaches an end user's computer, so it is
handled at the renderers rather than left to the caller.

Mitigation (OWASP-recommended): prefix the cell with a single quote, which the
spreadsheet treats as "this is text". Plain numbers are left alone so negative
totals and stock adjustments still behave like numbers.
"""
from __future__ import annotations

import re

# Characters that start a formula in Excel / LibreOffice / Sheets.
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")

# A plain number is safe and should stay numeric (-5 stock, -1200.50 total).
_PLAIN_NUMBER = re.compile(r"^-?\d+(\.\d+)?$")


def csv_safe(value: object) -> object:
    """Neutralise one cell for spreadsheet export.

    Non-strings pass through untouched; strings that look like a formula get a
    leading apostrophe; plain numbers are returned as-is.
    """
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value
    s = str(value)
    if not s or s[0] not in FORMULA_PREFIXES:
        return value
    if _PLAIN_NUMBER.match(s):
        return value
    return "'" + s


def is_defused(value: object) -> bool:
    """True when a rendered cell can no longer be read as a formula.

    Used by the tests as an independent check on rendered output: every cell
    of an export must satisfy this.
    """
    if not isinstance(value, str) or not value:
        return True
    if value[0] not in FORMULA_PREFIXES:
        return True
    return bool(_PLAIN_NUMBER.match(value))


def safe_row(row: object) -> list[object]:
    """Apply :func:`csv_safe` across one row."""
    return [csv_safe(cell) for cell in (row or [])]


def defuse_workbook(wb) -> None:
    """Neutralise formula cells in an openpyxl workbook, in place.

    openpyxl types any string starting with ``=`` as a formula on assignment,
    so the XLSX path needs this pass after the sheet is built — escaping the
    value before ``ws.append`` is not enough for every call site.
    """
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for cell in row:
                value = cell.value
                if not isinstance(value, str) or not value:
                    continue
                if cell.data_type == "f" or value[0] in FORMULA_PREFIXES:
                    if _PLAIN_NUMBER.match(value):
                        continue
                    cell.value = "'" + value
