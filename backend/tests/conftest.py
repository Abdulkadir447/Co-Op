"""Shared fixtures for the Co-op backend test suite.

Uses an isolated SQLite database (or Postgres when TEST_DATABASE_URL is set)
and overrides the two auth/db dependencies so tests can drive multiple tenants
without Clerk or a live database.
"""
from __future__ import annotations

import os

os.environ.setdefault("COOP_ENV", "testing")

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from typing import Optional

from backend.clerk_auth import ClerkUser, verify_clerk_token
from backend.database import get_db
from backend.main import app
from backend.models import Base


@pytest_asyncio.fixture
async def engine(tmp_path):
    """Per-test isolated database. Postgres when TEST_DATABASE_URL is set,
    otherwise a temp SQLite file (aiosqlite)."""
    url = os.getenv("TEST_DATABASE_URL") or f"sqlite+aiosqlite:///{tmp_path / 'coop_test.db'}"
    # A plain postgres(ql):// URL makes SQLAlchemy pick the sync psycopg2
    # driver; the suite is async, so canonicalise to asyncpg (same rule as
    # backend.config.database_url) — otherwise create_async_engine imports
    # psycopg2 and dies with ModuleNotFoundError.
    if url.startswith("postgres://"):
        url = "postgresql+asyncpg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://"):]
    eng = create_async_engine(url)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest.fixture
def session_factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


class TestApi:
    """Wraps the ASGI client plus the current (fake) Clerk identity."""

    def __init__(self, client: AsyncClient):
        self.client = client

    def set_user(self, user_id: str, email: Optional[str] = None) -> None:
        async def override_verify():
            return ClerkUser(
                user_id=user_id, session_id="test-session", azp=None, email=email
            )

        app.dependency_overrides[verify_clerk_token] = override_verify


@pytest_asyncio.fixture
async def api(engine, session_factory):
    async def override_get_db():
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        wrapper = TestApi(client)
        wrapper.set_user("user-a")
        yield wrapper

    app.dependency_overrides.clear()
