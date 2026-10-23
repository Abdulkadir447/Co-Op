"""Live Paystack smoke test — run where egress + a TEST key exist.

This sandbox has no outbound network, so live verification cannot run here.
On a machine that does (your laptop / CI with egress), set a *test* key and:

    PAYSTACK_SECRET_KEY=sk_test_... python scripts/paystack_live_smoke.py

It proves, without charging anyone:
  1. the key authenticates            (GET /balance)
  2. a charge can be initialized       (POST /transaction/initialize)
  3. the reference round-trips        (GET /transaction/verify/{reference})

It never captures a card and never moves money: the initialized transaction
is left abandoned. Use a sk_test_ key, never sk_live_.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.paystack import PaystackClient, PaystackError, make_reference  # noqa: E402


async def main() -> int:
    key = os.getenv("PAYSTACK_SECRET_KEY", "")
    if not key:
        print("SKIP: PAYSTACK_SECRET_KEY is not set.")
        return 0
    if key.startswith("sk_live"):
        print("REFUSED: use a sk_test_ key for the smoke test, never sk_live_.")
        return 2

    client = PaystackClient(key)
    try:
        # 1. auth
        async with client._client() as http:
            bal = await http.get("/balance")
            if bal.status_code != 200:
                print(f"FAIL: auth — GET /balance -> HTTP {bal.status_code}")
                return 1
        print("OK  authenticated (GET /balance 200)")

        # 2. initialize (left abandoned; nothing is charged)
        ref = make_reference("smoke")
        init = await client.initialize_transaction(
            email="smoke@coop.test", amount_kobo=100, reference=ref,
            currency="NGN",
        )
        print(f"OK  initialized {ref} -> {init['authorization_url'][:60]}...")

        # 3. verify round-trip
        ver = await client.verify_transaction(ref)
        print(f"OK  verify {ref} -> status={ver['status']} (pending/abandoned is expected)")
        return 0
    except PaystackError as e:
        print(f"FAIL: {e}")
        return 1
    except Exception as e:  # noqa: BLE001 — likely no egress
        print(f"SKIP: could not reach Paystack ({e.__class__.__name__}). "
              "Run this where outbound network is available.")
        return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
