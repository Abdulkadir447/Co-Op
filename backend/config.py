"""
Runtime configuration loader (IPD Chapter 1.11 — Configuration Management).

Environment-specific, non-secret values live in ``config/<env>.json`` at the
repository root. Secrets (DB passwords, JWT secret, API keys) are NEVER stored
in those files — they are resolved from environment variables at runtime.

Selection order:
    1. ``COOP_ENV`` env var (development | testing | production)
    2. ``APP_ENV`` env var
    3. default: ``development``
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

VALID_ENVS = ("development", "testing", "production")
DEFAULT_ENV = "development"

# Repository root = parent of the backend package directory.
_REPO_ROOT = Path(__file__).resolve().parent.parent
_CONFIG_DIR = _REPO_ROOT / "config"


def _load_dotenv_once() -> None:
    """Load ``.env`` from the repository root, IF PRESENT (dependency-free).

    Standard 12-factor semantics: values already in the real environment
    ALWAYS win — ``.env`` only fills gaps, so it can never override a
    deployment's settings. The file is gitignored; only non-secret
    placeholders (``.env.example``) are committed. This is what makes a
    local ``OPENROUTER_API_KEY`` in ``.env`` work without extra tooling.
    """
    if getattr(_load_dotenv_once, "_done", False):
        return
    _load_dotenv_once._done = True  # type: ignore[attr-defined]
    env_file = _REPO_ROOT / ".env"
    if not env_file.exists():
        return
    try:
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            if line.startswith("export "):
                line = line[len("export "):]
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip("'\"")
            if key:
                os.environ.setdefault(key, value)
    except OSError:
        # A broken .env must never prevent the API from starting.
        pass


_load_dotenv_once()


def _resolve_env() -> str:
    # COOP_ENV is the current name. FINCH_ENV (the pre-rename project name) is
    # still honoured so an existing .env keeps working after the rename.
    env = os.getenv("COOP_ENV") or os.getenv("FINCH_ENV") or os.getenv("APP_ENV") or DEFAULT_ENV
    return env if env in VALID_ENVS else DEFAULT_ENV


@lru_cache(maxsize=1)
def load_config(env: str | None = None) -> dict[str, Any]:
    """Load the merged configuration for the given (or active) environment.

    The returned dict is the static, non-secret configuration. Secrets must be
    fetched separately via :func:`secret` so they never persist in the dict.
    """
    env = env or _resolve_env()
    # Validate the resolved env against the allow-list. Without this, a caller
    # passing an arbitrary `env` could traverse the filesystem (e.g. "../secrets").
    if env not in VALID_ENVS:
        env = DEFAULT_ENV
    path = _CONFIG_DIR / f"{env}.json"
    if not path.exists():
        raise FileNotFoundError(
            f"Config file not found: {path}. Expected one of {VALID_ENVS}."
        )
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def get_env() -> str:
    """Return the active environment name."""
    return _resolve_env()


def secret(name: str, default: str | None = None) -> str | None:
    """Resolve a secret from the environment (IPD 1.11 — no secrets in repo)."""
    return os.getenv(name, default)


def get(key: str, default: Any = None) -> Any:
    """Convenience accessor for a top-level config key."""
    return load_config().get(key, default)


# Commonly referenced settings exposed as module-level helpers.
def validate_database_url(url: str) -> str:
    """Reject the three URLs people actually paste here by mistake.

    A URL that is not a database connection string does not fail cleanly: it
    reaches SQLAlchemy as a dialect name, and the error is

        Can't load plugin: sqlalchemy.dialects:https

    which names neither the variable nor the fix. The commonest mistake is
    pasting the Supabase **project URL** (`https://<ref>.supabase.co`) instead
    of the database connection string beside it in the dashboard. Say so, name
    the variable, and show the shape that works.
    """
    if not url:
        raise RuntimeError("DATABASE_URL is empty.")

    if url.startswith(("http://", "https://")):
        ref = url.rstrip("/").rsplit("//", 1)[-1].split(".")[0]
        raise RuntimeError(
            f"DATABASE_URL is a web address ({url.split('://')[0]}://...), not a "
            "database connection string. That value belongs in SUPABASE_URL.\n"
            "Use the Postgres string from Supabase (Project Settings -> Database "
            "-> Connection string -> URI), which looks like:\n"
            f"  postgresql://postgres.{ref}:<password>"
            "@aws-0-<region>.pooler.supabase.com:5432/postgres"
        )

    if "://" not in url:
        raise RuntimeError(
            f"DATABASE_URL has no scheme ({url[:40]!r}). It must start with "
            "postgresql:// (or sqlite+aiosqlite:// in the testing environment)."
        )

    scheme = url.split("://", 1)[0].split("+", 1)[0]
    if scheme not in {"postgresql", "postgres", "sqlite"}:
        raise RuntimeError(
            f"DATABASE_URL uses an unknown scheme {scheme!r}. Expected "
            "postgresql:// (Supabase) or sqlite+aiosqlite:// (testing only)."
        )
    return url


def database_url() -> str:
    """Resolve the SQLAlchemy database URL.

    Co-op targets Supabase/Postgres. Production and development both require an
    explicit ``DATABASE_URL`` (or ``SUPABASE_DB_URL``); SQLite is available ONLY
    in the ``testing`` environment. There is no silent fallback that could mask
    a missing or misconfigured production database (Task 11 / audit H3).
    """
    explicit = secret("DATABASE_URL") or secret("SUPABASE_DB_URL")
    if explicit:
        explicit = validate_database_url(explicit.strip())
        # Canonical postgres URLs need the async driver scheme for SQLAlchemy.
        if explicit.startswith("postgres://"):
            explicit = "postgresql+asyncpg://" + explicit[len("postgres://"):]
        elif explicit.startswith("postgresql://"):
            explicit = "postgresql+asyncpg://" + explicit[len("postgresql://"):]
        return explicit

    if get_env() == "testing":
        return "sqlite+aiosqlite:///./coop_test.db"

    raise RuntimeError(
        "DATABASE_URL is not set. Co-op requires a Postgres/Supabase connection "
        "string (e.g. postgresql://user:pass@host:5432/coop). SQLite is only "
        "available in the testing environment."
    )
