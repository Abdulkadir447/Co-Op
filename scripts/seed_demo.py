#!/usr/bin/env python3
"""Seed a demo trading history into ONE existing business.

    python scripts/seed_demo.py --email you@example.com
    python scripts/seed_demo.py --email you@example.com --force

Sign up in the app first (that creates the business), then run this: the
business gets 10 products, 12 customers, ~11 weeks of orders, invoices,
payments and a stock ledger that reconciles.

Refuses to touch a business that already has products unless --force is given,
because the difference between "demo data" and "deleted a customer's books" is
one careless flag. Useful for a screen recording, a design-partner demo, or a
founder who needs the reports to have something in them.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select  # noqa: E402

from backend.database import get_sessionmaker  # noqa: E402
from backend.demo import seed_business  # noqa: E402
from backend.models import Business  # noqa: E402


async def _run(email: str, weeks: int, force: bool) -> int:
    try:
        factory = get_sessionmaker()
    except RuntimeError as exc:
        # The config loader is deliberately loud when no database is configured.
        print(f"Cannot reach the database: {exc}")
        return 2
    async with factory() as session:
        business = (
            await session.execute(
                select(Business).where(
                    Business.owner_email == email, Business.deleted_at.is_(None)
                )
            )
        ).scalars().first()
        if business is None:
            print(f"No business is registered for {email!r}.")
            print("Sign in to the app once so the account exists, then run this again.")
            return 2

        try:
            summary = await seed_business(session, business, weeks=weeks, force=force)
        except ValueError as exc:
            print(f"Refused: {exc}")
            print("Re-run with --force only on a throwaway demo account.")
            return 3

        await session.commit()

    print(f"Seeded {business.name!r} (business {business.id}):")
    for key, value in summary.items():
        print(f"  {key:>16}: {value}")
    print("\nOpen the dashboard — the reports, receivables and stock pages now have data.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True, help="the business owner_email to seed")
    parser.add_argument("--weeks", type=int, default=11, help="weeks of history (default 11)")
    parser.add_argument(
        "--force", action="store_true",
        help="seed even if the business already has products (demo tenants only)",
    )
    args = parser.parse_args()
    if args.weeks < 1 or args.weeks > 52:
        parser.error("--weeks must be between 1 and 52")
    return asyncio.run(_run(args.email, args.weeks, args.force))


if __name__ == "__main__":
    raise SystemExit(main())
