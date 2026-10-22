"""Supabase Storage client — object uploads, public URLs, deletes.

Co-op uses Supabase for its Postgres database. Storage is the other Supabase
service the product has a use for: durable files that must outlive a request,
such as a business logo or an exported invoice PDF. Everything else Supabase
offers is either already covered (the database, RLS, migrations) or handled
elsewhere — identity is Clerk, and the API is this FastAPI app, which cannot
run as an Edge Function because those are TypeScript-only.

Design notes:

* **No SDK.** Supabase Storage is a plain REST API, and httpx is already a
  dependency (Clerk JWKS retrieval). Adding ``supabase-py`` would pull in
  Gotrue/PostgREST/Realtime clients for one feature.
* **Inert when unconfigured**, exactly like backend/paystack.py: no
  ``SUPABASE_URL`` / ``SUPABASE_SERVICE_ROLE_KEY`` means ``is_configured()``
  is False and callers get a clear 503 rather than a crash at import time.
* **Service-role key, server-side only.** It bypasses RLS, so it must never
  reach the client. Reads that browsers perform go through public or signed
  URLs, not this key.
* **Paths are validated.** Storage paths become URL segments and filesystem
  names inside a bucket, so traversal and absolute paths are rejected.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Optional

import httpx

from .config import secret

# Supabase's own object-name rules, tightened: no traversal, no leading slash,
# no empty segment. Keeps a caller-supplied filename from escaping its prefix.
_SAFE_SEGMENT = re.compile(r"^[A-Za-z0-9._ -]{1,120}$")

DEFAULT_BUCKET = "coop-assets"
# Branding assets and generated documents are small; refuse anything larger
# rather than buffering it into memory.
MAX_BYTES = 5 * 1024 * 1024


class StorageNotConfigured(RuntimeError):
    """Raised when a Storage call is attempted without credentials."""


class StorageError(RuntimeError):
    """Raised when Supabase Storage rejects a request."""

    def __init__(self, message: str, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class StorageConfig:
    """Where Storage lives and which key to use. Values come from the env."""

    url_env: str = "SUPABASE_URL"
    key_env: str = "SUPABASE_SERVICE_ROLE_KEY"
    bucket: str = DEFAULT_BUCKET
    timeout: float = 30.0
    # Injected by tests (httpx.MockTransport); None means real network.
    transport: Optional[httpx.BaseTransport] = None

    @property
    def url(self) -> Optional[str]:
        raw = secret(self.url_env)
        if not raw:
            return None
        return raw.rstrip("/")

    @property
    def service_key(self) -> Optional[str]:
        return secret(self.key_env) or None


def _client(cfg: StorageConfig) -> httpx.Client:
    """Single place a Client is built, so tests can swap the transport."""
    return httpx.Client(timeout=cfg.timeout, transport=cfg.transport)


def storage_config() -> StorageConfig:
    """Build the config, letting the env override the bucket name."""
    return StorageConfig(bucket=secret("SUPABASE_STORAGE_BUCKET") or DEFAULT_BUCKET)


def is_configured(cfg: Optional[StorageConfig] = None) -> bool:
    """True only when both the project URL and the service-role key are set.

    A URL without a key (or vice versa) is a half-configured deployment, which
    is worth failing loudly on rather than discovering at first upload.
    """
    cfg = cfg or storage_config()
    return bool(cfg.url and cfg.service_key)


def validate_path(path: str) -> str:
    """Normalise and validate a Storage object path.

    Returns the cleaned relative path. Raises StorageError on anything that
    could escape the bucket prefix or produce an ambiguous URL.
    """
    if not path or not isinstance(path, str):
        raise StorageError("object path must be a non-empty string")

    cleaned = path.strip().replace("\\", "/").strip("/")
    if not cleaned:
        raise StorageError("object path must be a non-empty string")

    segments = cleaned.split("/")
    if len(segments) > 6:
        raise StorageError("object path has too many segments")

    for segment in segments:
        if segment in (".", "..") or not _SAFE_SEGMENT.match(segment):
            raise StorageError(f"invalid segment in object path: {segment!r}")

    return "/".join(segments)


def _headers(cfg: StorageConfig, content_type: Optional[str]) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {cfg.service_key}",
        "Content-Type": content_type or "application/octet-stream",
    }


def public_url(path: str, cfg: Optional[StorageConfig] = None) -> str:
    """The unauthenticated URL for an object in a PUBLIC bucket.

    Returns the URL without touching the network — it is deterministic. For a
    private bucket use :func:`signed_url` instead, or the object will 400.
    """
    cfg = cfg or storage_config()
    if not cfg.url:
        raise StorageNotConfigured(f"{cfg.url_env} is not set")
    return f"{cfg.url}/storage/v1/object/public/{cfg.bucket}/{validate_path(path)}"


def upload(
    path: str,
    data: bytes,
    content_type: str = "application/octet-stream",
    *,
    upsert: bool = True,
    cfg: Optional[StorageConfig] = None,
) -> dict[str, Any]:
    """Upload bytes and return ``{"path", "url", "bucket", "size"}``.

    ``upsert=True`` overwrites an existing object, which is what a user
    replacing their logo expects. Pass False to make a collision an error.
    """
    cfg = cfg or storage_config()
    if not is_configured(cfg):
        raise StorageNotConfigured(
            f"Supabase Storage is not configured (need {cfg.url_env} and {cfg.key_env})"
        )
    if not isinstance(data, bytes):
        raise StorageError("upload payload must be bytes")
    if not data:
        raise StorageError("upload payload is empty")
    if len(data) > MAX_BYTES:
        raise StorageError(f"upload exceeds the {MAX_BYTES // (1024 * 1024)} MB limit")

    clean = validate_path(path)
    url = f"{cfg.url}/storage/v1/object/{cfg.bucket}/{clean}"
    headers = _headers(cfg, content_type)
    if upsert:
        headers["x-upsert"] = "true"

    try:
        with _client(cfg) as client:
            r = client.post(url, content=data, headers=headers)
    except httpx.HTTPError as exc:
        raise StorageError(f"could not reach Supabase Storage: {exc}") from exc

    if r.status_code >= 300:
        raise StorageError(
            f"Storage upload failed ({r.status_code}): {r.text[:200]}", r.status_code
        )

    return {
        "path": clean,
        "bucket": cfg.bucket,
        "url": public_url(clean, cfg),
        "size": len(data),
    }


def signed_url(path: str, expires_in: int = 3600, cfg: Optional[StorageConfig] = None) -> str:
    """A time-limited URL for an object in a PRIVATE bucket."""
    cfg = cfg or storage_config()
    if not is_configured(cfg):
        raise StorageNotConfigured(
            f"Supabase Storage is not configured (need {cfg.url_env} and {cfg.key_env})"
        )
    if not 1 <= expires_in <= 604800:
        raise StorageError("expires_in must be between 1 and 604800 seconds")

    clean = validate_path(path)
    url = f"{cfg.url}/storage/v1/object/sign/{cfg.bucket}/{clean}"
    try:
        with _client(cfg) as client:
            r = client.post(
                url,
                json={"expiresIn": expires_in},
                headers={"Authorization": f"Bearer {cfg.service_key}"},
            )
    except httpx.HTTPError as exc:
        raise StorageError(f"could not reach Supabase Storage: {exc}") from exc

    if r.status_code >= 300:
        raise StorageError(
            f"Storage signing failed ({r.status_code}): {r.text[:200]}", r.status_code
        )
    token = r.json().get("signedURL") or r.json().get("signedUrl")
    if not token:
        raise StorageError("Storage returned no signed URL")
    return f"{cfg.url}/storage/v1{token}"


def delete(path: str, cfg: Optional[StorageConfig] = None) -> bool:
    """Delete an object. Returns True if Storage accepted the request.

    Storage answers 200 with an empty list for a path that never existed, so
    "deleted" here means "no longer present", which is what callers want.
    """
    cfg = cfg or storage_config()
    if not is_configured(cfg):
        raise StorageNotConfigured(
            f"Supabase Storage is not configured (need {cfg.url_env} and {cfg.key_env})"
        )
    clean = validate_path(path)
    url = f"{cfg.url}/storage/v1/object/{cfg.bucket}/{clean}"
    try:
        with _client(cfg) as client:
            r = client.delete(url, headers={"Authorization": f"Bearer {cfg.service_key}"})
    except httpx.HTTPError as exc:
        raise StorageError(f"could not reach Supabase Storage: {exc}") from exc

    if r.status_code >= 300:
        raise StorageError(
            f"Storage delete failed ({r.status_code}): {r.text[:200]}", r.status_code
        )
    return True


def list_buckets(cfg: Optional[StorageConfig] = None) -> list[dict[str, Any]]:
    """Every bucket in the project. Used by the connection check."""
    cfg = cfg or storage_config()
    if not is_configured(cfg):
        raise StorageNotConfigured(
            f"Supabase Storage is not configured (need {cfg.url_env} and {cfg.key_env})"
        )
    try:
        with _client(cfg) as client:
            r = client.get(
                f"{cfg.url}/storage/v1/bucket",
                headers={"Authorization": f"Bearer {cfg.service_key}"},
            )
    except httpx.HTTPError as exc:
        raise StorageError(f"could not reach Supabase Storage: {exc}") from exc

    if r.status_code >= 300:
        raise StorageError(
            f"Storage bucket listing failed ({r.status_code}): {r.text[:200]}",
            r.status_code,
        )
    return r.json()
