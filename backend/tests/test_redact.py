"""`scrub_text` keeps secrets out of logs — including the database password.

Found while adding the development 500 handler: a SQLAlchemy error message
routinely embeds the DSN, so an unscrubbed traceback in the log carried the real
Supabase password. The shapes below are the ones that actually appear in this
codebase's logs; the SQLite path must survive untouched, because a scrubbed log
line that cannot tell you which file to delete is not a useful log line.
"""
from __future__ import annotations

import pytest

from backend.redact import MASK, scrub_text


@pytest.mark.parametrize(
    "text, secret",
    [
        ("sk_live_abc123", "abc123"),
        ("pk_test_9f8e7d", "9f8e7d"),
        ("Authorization: Bearer eyJhbGciOi.abc.def", "eyJhbGciOi"),
        ("password=hunter2", "hunter2"),
        ("api_key: k_live_xyz", "k_live_xyz"),
    ],
)
def test_known_secret_shapes_are_masked(text, secret):
    assert secret not in scrub_text(text)


@pytest.mark.parametrize(
    "dsn",
    [
        "postgresql://postgres.abcdefgh:s3cret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
        "postgresql+asyncpg://postgres:pw@db.example.com:5432/coop",
        "postgres://user:pa55word@localhost:5432/coop",
    ],
)
def test_a_connection_string_loses_its_password_but_keeps_its_host(dsn):
    scrubbed = scrub_text(dsn)
    assert "s3cret" not in scrubbed and "pa55word" not in scrubbed
    assert ":***@" in scrubbed, scrubbed
    # The useful parts survive: which server was it?
    assert "@" in scrubbed and ":5432" in scrubbed


def test_a_sqlite_path_survives_because_it_names_a_file_to_delete():
    dsn = "sqlite+aiosqlite:///./coop_test.db"
    assert scrub_text(dsn) == dsn


def test_ordinary_text_is_untouched():
    text = "DATABASE SCHEMA IS BEHIND THIS CODE (postgres db.example.com)"
    assert scrub_text(text) == text


def test_empty_input_is_returned_unchanged():
    assert scrub_text("") == ""


def test_the_mask_is_not_itself_a_secret_shape():
    """Masking twice must not mangle the output (logs get scrubbed twice:
    once at the throw site, once before writing)."""
    once = scrub_text("postgresql://u:hunter2@h/db")
    assert MASK in once
    assert scrub_text(once) == once
