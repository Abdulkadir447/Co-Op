"""
Database connection and session management for FastAPI + SQLAlchemy (async).

Targets Supabase/Postgres via asyncpg. All API endpoints depend on the
`get_db()` generator which yields an AsyncSession that is automatically closed
after the request. The URL is resolved lazily on first engine use so importing
this module never touches the environment or loads a DB driver (Task 11 /
audit H3).
"""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    create_async_engine,
)
from sqlalchemy.orm import sessionmaker

from .config import database_url as _resolve_database_url
from .models import Base  # Relative import for package mode

# Engine is created lazily on first use so that importing this module never
# forces the async DB driver to load or the DB URL to resolve. The dialect/
# driver is only imported when the engine is actually instantiated.
_engine: AsyncEngine | None = None


def resolve_database_url() -> str:
    """Resolve the database URL via the central config loader.

    Raises (rather than silently falling back) outside the testing environment
    when no DATABASE_URL is configured — a missing production database must be
    a loud failure, not a local SQLite file.
    """
    return _resolve_database_url()


#: A single statement may not hold a connection forever. Long reports are
#: bounded work; a query that runs for minutes is a bug or a runaway client, and
#: in both cases the pool should get the connection back.
STATEMENT_TIMEOUT_MS = 30_000


def _engine_kwargs(url: str) -> dict:
    """Driver-specific engine options."""
    kwargs: dict = {"echo": False}
    if url.startswith("postgresql"):
        kwargs["pool_pre_ping"] = True
        kwargs["connect_args"] = {
            "server_settings": {"statement_timeout": str(STATEMENT_TIMEOUT_MS)}
        }
    return kwargs


def get_engine() -> AsyncEngine:
    """Return the shared async engine, creating it on first call."""
    global _engine
    if _engine is None:
        # echo=False: enable only for debugging; never log sensitive data.
        url = resolve_database_url()
        _engine = create_async_engine(url, **_engine_kwargs(url))
    return _engine


def get_sessionmaker() -> sessionmaker:
    """Build a request-scoped async session factory (expire_on_commit=False)."""
    return sessionmaker(get_engine(), class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency generator for FastAPI.

    Yields a single `AsyncSession` and ensures it is always closed – even if an
    exception occurs. This pattern enables request‑scoped database access.
    """
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        try:
            yield session
            await session.commit()  # auto‑commit on successful response
        except Exception:
            await session.rollback()  # rollback on error – caller may re‑raise
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Initialise the database with our ORM models (run once at startup).

    In a production‑grade app this would be: Alembic migrations. For Phase 1
    we run the `CREATE TABLE IF NOT EXISTS …` statements directly via
    Base.metadata.create_all().
    """
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


# Optional cleanup hook – not required for this phase but useful for tests.
async def dispose_db() -> None:
    """Close all connections and release resources. Call on app shutdown."""
    global _engine
    if _engine is not None:
        await _engine.dispose()
        _engine = None
