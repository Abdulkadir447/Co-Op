"""Co-op licensing — issuing, activation and revocation.

PRD Ch7 §7.19 (Licensing System) + Ch8 §8.15 (``License`` table).

The flow, end to end::

    Co-op team                                     Customer
    ----------                                     --------
    tools/generate_license.py                      Settings -> Licence
      (or POST /admin/generate-license)              paste the key
            |                                            |
            v                                            v
    a signed activation string  ----  email  ---->  POST /licenses/activate
                                                     signature verified,
                                                     business matched, row
                                                     recorded, plan granted

Design decisions
----------------
* **A licence is a self-contained signed token.** It carries the business id,
  plan, seats and expiry as a 16-byte packed payload, signed with HMAC-SHA256
  under ``LICENSE_SIGNING_KEY`` — compact enough to read aloud and paste.
  Nothing has to exist in the database for a string to be valid, which is what
  lets the team mint keys from a script with no database access — and what
  makes expiry a pure function of (``ends_at``, ``now``), exactly like the free
  trial: no scheduler, no downgrade job, nothing that can drift.
* **The signing key lives only in the environment.** Never in ``config/*.json``,
  never in the repo. Without it the server refuses to issue or verify.
* **The signature is truncated to 128 bits** so a key stays pasteable; that is
  still far outside brute force (and matches TOTP practice).
* **The server stores a SHA-256 fingerprint, never the key itself**, so a
  database leak cannot be replayed as activation strings.
* **Revocation is explicit and wins over a valid signature.**
* **A licence is bound to one business.** Activating someone else's key is a
  403, not a silent re-grant — same philosophy as the trial.
"""
from __future__ import annotations

import base64
import datetime as dt
import hashlib
import hmac
import os
import struct
from dataclasses import dataclass
from typing import Any, Optional

from sqlalchemy import select

from . import billing as billing_mod
from .config import load_config
from .models import Business, License, Subscription  # noqa: F401  (Subscription re-exported)

#: Prefix group of a printed key. It is dropped on normalisation, so the
#: body itself never has to be distinguished from the prefix.
KEY_PREFIX = "COOP"
#: Body characters (RFC 4648 base32, no padding): unambiguous when read aloud
#: and safe to group with dashes.
_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
_SIG_BYTES = 16  # 128-bit truncated HMAC — see module docstring.
_GROUP = 5

#: Compact binary payload (big-endian, 16 bytes) — what makes a key short
#: enough to read aloud and paste:
#:   version(1) business_id(4) plan(1) seats(2) issued_epoch(4) expires_epoch(4)
#: ``expires_epoch == 0`` means perpetual. JSON would triple the key length.
_PACK = ">BIBHII"
_VERSION = 1
_PLAN_CODES = {"starter": 1, "professional": 2, "enterprise": 3}
_PLAN_NAMES = {code: name for name, code in _PLAN_CODES.items()}
_MAX_BUSINESS_ID = 2**32 - 1
_MAX_SEATS = 2**16 - 1

DEFAULT_DAYS = 365
MAX_DAYS = 3650


class LicenseError(ValueError):
    """A licence could not be issued, verified or activated.

    ``reason`` is a stable machine-readable code the UI can branch on; the
    message is the owner-facing sentence.
    """

    def __init__(self, reason: str, message: str):
        super().__init__(message)
        self.reason = reason
        self.message = message


# ---------------------------------------------------------------------------
# Configuration / secrets
# ---------------------------------------------------------------------------

def licensing_config() -> dict[str, Any]:
    return load_config().get("licensing", {}) or {}


def signing_key() -> bytes:
    """The HMAC key, from the environment only.

    ``LICENSE_SIGNING_KEY`` (hex or plain text). Kept out of config files so
    a leaked repo or config dump can never mint licences.
    """
    raw = os.environ.get("LICENSE_SIGNING_KEY", "").strip()
    if not raw:
        raise LicenseError(
            "not_configured",
            "Licensing is not configured on this server (LICENSE_SIGNING_KEY is missing).",
        )
    try:
        return bytes.fromhex(raw)
    except ValueError:
        return raw.encode("utf-8")


def admin_tokens() -> list[str]:
    """Team-only tokens for the /admin/licence routes.

    ``LICENSE_ADMIN_TOKENS`` (comma-separated) with a config fallback so a
    deployment can keep them in its secret store instead.
    """
    raw = os.environ.get("LICENSE_ADMIN_TOKENS", "").strip()
    tokens = [t.strip() for t in raw.split(",") if t.strip()] if raw else []
    if not tokens:
        cfg = licensing_config().get("admin_tokens", []) or []
        tokens = [str(t).strip() for t in cfg if str(t).strip()]
    return tokens


def default_days() -> int:
    try:
        days = int(licensing_config().get("default_days", DEFAULT_DAYS))
    except (TypeError, ValueError):
        days = DEFAULT_DAYS
    return max(1, min(days, MAX_DAYS))


# ---------------------------------------------------------------------------
# Encoding — base32 body, dashed groups
# ---------------------------------------------------------------------------

def _b32encode(data: bytes) -> str:
    return base64.b32encode(data).decode("ascii").rstrip("=")


def _b32decode(text: str) -> bytes:
    padded = text + "=" * ((8 - len(text) % 8) % 8)
    try:
        return base64.b32decode(padded, casefold=False)
    except Exception as exc:  # binascii.Error and friends
        raise LicenseError("malformed", "That licence key could not be read.") from exc


def _group(body: str) -> str:
    groups = [body[i : i + _GROUP] for i in range(0, len(body), _GROUP)]
    return f"{KEY_PREFIX}-" + "-".join(groups)


#: Body length is fixed (16-byte payload + 16-byte signature, base32) — which
#: is what makes normalisation unambiguous: a pasted key either is the body,
#: or is the body with the ``COOP`` prefix attached. Nothing has to be guessed.
BODY_LENGTH = 52


def normalize_key(raw: str) -> str:
    """Reduce any pasted form of a key to its bare base32 body.

    Tolerates what people actually do to a key in an email client: lower or
    upper case, stray spaces, newlines, and dashes removed or doubled.
    """
    if not raw or not raw.strip():
        raise LicenseError("empty", "Enter the licence key you were sent.")
    text = "".join(ch for ch in raw.upper() if ch.isalnum())
    if len(text) == BODY_LENGTH + len(KEY_PREFIX) and text.startswith(KEY_PREFIX):
        text = text[len(KEY_PREFIX):]
    if len(text) != BODY_LENGTH or any(ch not in _ALPHABET for ch in text):
        raise LicenseError(
            "malformed",
            "That licence key could not be read — paste it exactly as it was sent.",
        )
    return text


def _to_epoch(moment: dt.datetime) -> int:
    return int(moment.replace(microsecond=0, tzinfo=dt.timezone.utc).timestamp())


def _from_epoch(seconds: int) -> dt.datetime:
    """Naive UTC datetime — the convention every other timestamp here uses."""
    return dt.datetime.fromtimestamp(seconds, dt.timezone.utc).replace(tzinfo=None)


def fingerprint(raw_or_body: str) -> str:
    """Stable SHA-256 fingerprint of a key — what the database stores."""
    try:
        body = normalize_key(raw_or_body)
    except LicenseError:
        body = raw_or_body.strip().upper()
    return hashlib.sha256(body.encode("ascii")).hexdigest()


# ---------------------------------------------------------------------------
# Issue / verify
# ---------------------------------------------------------------------------

@dataclass
class Claims:
    """The verified contents of an activation string."""

    business_id: int
    plan: str
    seats: int
    issued_at: dt.datetime
    expires_at: Optional[dt.datetime]
    fingerprint: str

    def is_expired(self, now: Optional[dt.datetime] = None) -> bool:
        return self.expires_at is not None and (now or billing_mod._now()) >= self.expires_at

    def to_dict(self) -> dict[str, Any]:
        return {
            "business_id": self.business_id,
            "plan": self.plan,
            "plan_label": billing_mod.plan_label(self.plan),
            "seats": self.seats,
            "issued_at": self.issued_at.isoformat(),
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "fingerprint": self.fingerprint,
        }


@dataclass
class IssuedLicense(Claims):
    """A freshly minted licence, including the string to deliver."""

    key: str = ""

    def to_dict(self) -> dict[str, Any]:
        out = super().to_dict()
        out["license_key"] = self.key
        return out


def _sign(body: str) -> str:
    digest = hmac.new(signing_key(), body.encode("ascii"), hashlib.sha256).digest()
    return _b32encode(digest[:_SIG_BYTES])


def issue(
    business_id: int,
    plan: str,
    seats: int = 1,
    days: Optional[int] = None,
    expires_at: Optional[dt.datetime] = None,
    now: Optional[dt.datetime] = None,
) -> IssuedLicense:
    """Bundle a business id + plan into a signed activation string.

    Pure and database-free on purpose: the same code runs inside the API and
    inside ``tools/generate_license.py`` with no connection at all.
    """
    plan = (plan or "").strip().lower()
    if plan not in billing_mod.VALID_PLANS:
        raise LicenseError(
            "invalid_plan", f"plan must be one of: {', '.join(billing_mod.VALID_PLANS)}"
        )
    if plan == billing_mod.PLAN_FREE:
        raise LicenseError("invalid_plan", "A licence for the Free plan is meaningless.")
    if not isinstance(business_id, int) or business_id <= 0:
        raise LicenseError("invalid_business", "business_id must be a positive integer.")
    seats = int(seats or 1)
    if seats < 1:
        raise LicenseError("invalid_seats", "seats must be at least 1.")
    if seats > _MAX_SEATS:
        raise LicenseError("invalid_seats", f"seats must be at most {_MAX_SEATS}.")
    if business_id > _MAX_BUSINESS_ID:
        raise LicenseError("invalid_business", "business_id is out of range.")

    issued = now or billing_mod._now()
    if expires_at is None:
        window = days if days is not None else default_days()
        if window <= 0:
            raise LicenseError("invalid_window", "days must be a positive number.")
        if window > MAX_DAYS:
            raise LicenseError("invalid_window", f"days must be at most {MAX_DAYS}.")
        expiry: Optional[dt.datetime] = issued + dt.timedelta(days=int(window))
    else:
        expiry = expires_at
        if expiry <= issued:
            raise LicenseError("invalid_window", "expires_at must be in the future.")

    payload = struct.pack(
        _PACK,
        _VERSION,
        business_id,
        _PLAN_CODES[plan],
        seats,
        _to_epoch(issued),
        _to_epoch(expiry) if expiry else 0,
    )
    payload_b32 = _b32encode(payload)
    body = payload_b32 + _sign(payload_b32)
    key = _group(body)
    return IssuedLicense(
        business_id=business_id,
        plan=plan,
        seats=seats,
        issued_at=issued,
        expires_at=expiry,
        fingerprint=fingerprint(body),
        key=key,
    )


def verify(raw: str, now: Optional[dt.datetime] = None) -> Claims:
    """Verify an activation string's signature and shape (not its business)."""
    body = normalize_key(raw)
    sig_len = len(_b32encode(b"\x00" * _SIG_BYTES))
    if len(body) <= sig_len:
        raise LicenseError("malformed", "That licence key is incomplete.")
    payload_b32, signature = body[:-sig_len], body[-sig_len:]
    if not hmac.compare_digest(_sign(payload_b32), signature):
        raise LicenseError("invalid_signature", "That licence key is not valid.")
    try:
        version, business_id, plan_code, seats, issued_epoch, expires_epoch = struct.unpack(
            _PACK, _b32decode(payload_b32)
        )
    except struct.error as exc:
        raise LicenseError("malformed", "That licence key could not be read.") from exc
    if version != _VERSION:
        raise LicenseError("unknown_version", "That licence key is from an unsupported version.")
    if plan_code not in _PLAN_NAMES:
        raise LicenseError("invalid_plan", "That licence key names an unknown plan.")
    claims = Claims(
        business_id=int(business_id),
        plan=_PLAN_NAMES[plan_code],
        seats=int(seats),
        issued_at=_from_epoch(int(issued_epoch)),
        expires_at=_from_epoch(int(expires_epoch)) if expires_epoch else None,
        fingerprint=fingerprint(body),
    )
    if claims.is_expired(now):
        raise LicenseError(
            "expired",
            "That licence key has expired. Ask the Co-op team for a renewed key.",
        )
    return claims


# ---------------------------------------------------------------------------
# Activation / revocation (database side)
# ---------------------------------------------------------------------------

async def activate(db, business: Business, raw: str, actor: Optional[str] = None) -> License:
    """Activate a key for the caller's own business.

    Every refusal is explicit: a wrong-business key, a revoked key and a key
    already activated by someone else all fail loudly rather than silently
    re-granting a paid plan.
    """
    claims = verify(raw)
    if claims.business_id != business.id:
        raise LicenseError(
            "wrong_business",
            "This licence was issued to a different business. It cannot be activated here.",
        )

    row = (
        await db.execute(select(License).where(License.fingerprint == claims.fingerprint))
    ).scalars().first()
    if row is not None and row.revoked_at is not None:
        raise LicenseError(
            "revoked", "This licence has been revoked. Contact the Co-op team."
        )
    if row is not None and row.activated_at is not None and row.business_id != business.id:
        raise LicenseError(
            "already_activated", "This licence has already been activated by another business."
        )

    now = billing_mod._now()
    if row is None:
        row = License(
            business_id=business.id,
            fingerprint=claims.fingerprint,
            plan=claims.plan,
            seats=claims.seats,
            issued_at=claims.issued_at,
            expires_at=claims.expires_at,
        )
        db.add(row)
    row.activated_at = now
    row.activated_by = actor or business.owner_id

    # Grant the plan the same way the trial does: a window on the
    # subscription, never an overwrite of the owned plan, so expiry needs no
    # scheduler and no downgrade job.
    sub = await billing_mod.get_or_create_subscription(db, business)
    sub.license_plan = claims.plan
    sub.license_seats = claims.seats
    sub.license_started_at = now
    sub.license_ends_at = claims.expires_at
    sub.license_fingerprint = claims.fingerprint
    sub.status = "licensed"
    sub.updated_by = actor or business.owner_id
    await db.flush()
    return row


async def revoke(db, fp: str, reason: Optional[str] = None, actor: Optional[str] = None) -> License:
    """Revoke an issued licence by fingerprint and withdraw any grant."""
    row = (await db.execute(select(License).where(License.fingerprint == fp))).scalars().first()
    if row is None:
        raise LicenseError("not_found", "No licence matches that key or fingerprint.")
    now = billing_mod._now()
    row.revoked_at = now
    row.revoked_reason = (reason or "")[:255] or None
    sub: Optional[Subscription] = (
        await db.execute(
            select(Subscription).where(Subscription.business_id == row.business_id)
        )
    ).scalars().first()
    if sub is not None and sub.license_fingerprint == row.fingerprint:
        sub.license_plan = None
        sub.license_seats = None
        sub.license_started_at = None
        sub.license_ends_at = None
        sub.license_fingerprint = None
        sub.status = "active"
        sub.updated_by = actor
    await db.flush()
    return row


async def find_by_key(db, raw: str) -> Optional[License]:
    try:
        fp = fingerprint(raw)
    except LicenseError:
        return None
    return (await db.execute(select(License).where(License.fingerprint == fp))).scalars().first()
