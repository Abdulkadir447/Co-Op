#!/usr/bin/env python3
"""Mint (or verify) a Co-op licence activation string — PRD Ch7 §7.19.

Deliberately database-free. A licence is a self-contained HMAC-SHA256 signed
token binding a business id + plan + seats + expiry, so the team can mint
keys from a laptop with nothing but the signing key — no database, no
session, no deployment. The server verifies the same signature when the
owner pastes the key into Settings -> Licence.

Mint a key::

    LICENSE_SIGNING_KEY=... python tools/generate_license.py \\
        --business-id 42 --plan professional --days 365 --seats 5

Check a key that is already out in the wild (also offline)::

    LICENSE_SIGNING_KEY=... python tools/generate_license.py --verify COOP-XXXX-...

The signing key is read from the environment only (never an argument, never
config), so it cannot land in a shell history file or a config dump. What
the server stores is the printed FINGERPRINT, not the key.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path

# Allow `python tools/generate_license.py` from the repo root.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import licensing  # noqa: E402
from backend.billing import VALID_PLANS  # noqa: E402


def _fail(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(2)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--business-id", type=int, help="the customer's Business id")
    parser.add_argument("--plan", choices=[p for p in VALID_PLANS if p != "free"],
                        help="the plan this licence grants")
    parser.add_argument("--days", type=int, default=None,
                        help=f"licence window in days (default {licensing.default_days()})")
    parser.add_argument("--seats", type=int, default=1, help="seats granted (default 1)")
    parser.add_argument("--expires", default=None,
                        help="absolute expiry YYYY-MM-DD (overrides --days)")
    parser.add_argument("--verify", default=None, metavar="KEY",
                        help="verify an existing activation string instead of minting one")
    parser.add_argument("--json", action="store_true", help="print machine-readable JSON")
    args = parser.parse_args()

    if not os.environ.get("LICENSE_SIGNING_KEY", "").strip():
        _fail("LICENSE_SIGNING_KEY is not set — the signing key comes from the environment.")

    try:
        if args.verify:
            claims = licensing.verify(args.verify)
            payload = claims.to_dict()
            payload["status"] = "valid"
            print(json.dumps(payload, indent=2) if args.json else _human_verify(payload))
            return 0

        if args.business_id is None or not args.plan:
            _fail("--business-id and --plan are required to mint a key.")
        expires_at = None
        if args.expires:
            try:
                expires_at = dt.datetime.strptime(args.expires, "%Y-%m-%d")
            except ValueError:
                _fail("--expires must be YYYY-MM-DD.")
        issued = licensing.issue(
            args.business_id, args.plan, seats=args.seats, days=args.days,
            expires_at=expires_at,
        )
    except licensing.LicenseError as exc:
        _fail(f"[{exc.reason}] {exc.message}")

    if args.json:
        print(json.dumps(issued.to_dict(), indent=2))
    else:
        print(_human_issue(issued))
    return 0


def _human_issue(issued: licensing.IssuedLicense) -> str:
    expires = (
        issued.expires_at.strftime("%Y-%m-%d") if issued.expires_at else "never (perpetual)"
    )
    return (
        "Co-op licence minted\n"
        "--------------------\n"
        f"  Business id : {issued.business_id}\n"
        f"  Plan        : {issued.plan}\n"
        f"  Seats       : {issued.seats}\n"
        f"  Expires     : {expires}\n"
        f"  Fingerprint : {issued.fingerprint}\n"
        "\nActivation string (send this to the customer — the server never stores it):\n"
        f"  {issued.key}\n"
        "\nThey paste it into Co-op -> Settings -> Licence.\n"
    )


def _human_verify(payload: dict) -> str:
    expires = payload["expires_at"][:10] if payload["expires_at"] else "never (perpetual)"
    return (
        "Licence key is VALID\n"
        f"  Business id : {payload['business_id']}\n"
        f"  Plan        : {payload['plan']}\n"
        f"  Seats       : {payload['seats']}\n"
        f"  Expires     : {expires}\n"
        f"  Fingerprint : {payload['fingerprint']}\n"
    )


if __name__ == "__main__":
    raise SystemExit(main())
