"""
Keep secrets and sensitive values out of logs and the audit ledger.

Two complementary tools:

* :func:`deep_redact` — walks a JSON-ish structure and masks any *leaf* whose
  **key** looks like a secret (``token``, ``password``, ``api_key``, …). Used
  when a request/changes dict is about to be persisted (the audit log) or
  echoed, so a stray ``Authorization`` header never lands in a row.
* :func:`scrub_text` — regex-scrubs well-known secret *shapes* (``sk_live_…``,
  ``sk_test_…``, ``Bearer …``, ``password=…``) out of an arbitrary string.
  Used on free-form text such as a traceback before it is logged.

Both are deliberately conservative: they mask things that look like secrets
and leave everything else untouched, so logs stay useful.
"""
from __future__ import annotations

import re
from typing import Any

MASK = "***"

# Key names whose values must never be persisted or logged.
_SENSITIVE_KEY = re.compile(
    r"(token|secret|passwd|password|authorization|api_?key|access_?code|"
    r"signature|private_?key|credential|session_?id|refresh_?token)",
    re.IGNORECASE,
)

# Secret shapes that can appear inside free-form text: (pattern, replacement).
# A replacement of MASK masks the whole match; a group reference keeps the
# identifying parts (scheme, user, host) and masks only the secret.
_SCRUB_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # Paystack / Stripe-style keys.
    (re.compile(r"\b(sk|pk)_(live|test)_[A-Za-z0-9_-]+"), MASK),
    # Bearer tokens in headers or logs.
    (re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._\-]+"), MASK),
    # key=value style secrets.
    (re.compile(
        r"(?i)\b(password|passwd|secret|token|api_?key)\s*[=:]\s*\S+"
    ), MASK),
    # The password inside a connection string: postgresql://user:PASSWORD@host.
    # Found while writing the error handler — a SQLAlchemy error message
    # routinely embeds the DSN, so an unscrubbed traceback put the real
    # Supabase password in the log. Only the password is masked; scheme, user
    # and host stay readable, which is what makes the line useful.
    (
        re.compile(r"(?i)\b(postgres(?:ql)?(?:\+[a-z0-9]+)?://[^:/@\s]+):[^@\s]+@"),
        r"\1:***@",
    ),
]


def _is_sensitive_key(key: Any) -> bool:
    return isinstance(key, str) and bool(_SENSITIVE_KEY.search(key))


def deep_redact(value: Any) -> Any:
    """Return a copy of ``value`` with sensitive leaves masked.

    Dicts are walked by key; lists/tuples element-wise. Anything that is not a
    dict/list is returned as-is (a bare string has no key to judge it by, so
    callers who have free text should use :func:`scrub_text` instead).
    """
    if isinstance(value, dict):
        out: dict[Any, Any] = {}
        for k, v in value.items():
            if _is_sensitive_key(k):
                out[k] = MASK
            else:
                out[k] = deep_redact(v)
        return out
    if isinstance(value, list):
        return [deep_redact(v) for v in value]
    if isinstance(value, tuple):
        return tuple(deep_redact(v) for v in value)
    return value


def scrub_text(text: str) -> str:
    """Mask known secret shapes inside an arbitrary string."""
    if not text:
        return text
    for pattern, replacement in _SCRUB_PATTERNS:
        text = pattern.sub(replacement, text)
    return text
