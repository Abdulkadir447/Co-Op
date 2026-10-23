"""Opt-in LIVE check against the real Paystack API.

The sandbox has no outbound network, so this can never prove anything live
here — the mocked tests in ``test_paystack.py`` already pin the
request/response shapes. Run it only where both egress and a key exist:

    COOP_PAYSTACK_LIVE=1 PAYSTACK_SECRET_KEY=sk_test_... \
        pytest backend/tests/test_paystack_live.py

It refuses a live key and never charges: it only initializes a transaction
and leaves it abandoned.
"""
from __future__ import annotations

import os

import pytest

from backend.paystack import PaystackClient, PaystackError, make_reference

LIVE = os.getenv("COOP_PAYSTACK_LIVE") in ("1", "true", "yes")
KEY = os.getenv("PAYSTACK_SECRET_KEY", "")

NEEDS = not (LIVE and KEY.startswith("sk_test_"))


@pytest.mark.skipif(NEEDS, reason="set COOP_PAYSTACK_LIVE=1 and a sk_test_ PAYSTACK_SECRET_KEY")
@pytest.mark.asyncio
async def test_live_initialize_and_verify_round_trip():
    client = PaystackClient(KEY)

    async with client._client() as http:
        bal = await http.get("/balance")
        assert bal.status_code == 200, f"auth failed: HTTP {bal.status_code}"

    ref = make_reference("smoke")
    init = await client.initialize_transaction(
        email="smoke@coop.test", amount_kobo=100, reference=ref, currency="NGN",
    )
    assert init["authorization_url"].startswith("http"), init

    ver = await client.verify_transaction(ref)
    # A fresh transaction is never "success" — pending/abandoned is honest.
    assert ver["status"] in ("pending", "abandoned", "failed")
    assert ver["reference"] == ref


def test_client_refuses_an_empty_key():
    # An empty key is always refused, live or not.
    with pytest.raises(PaystackError):
        PaystackClient("")
