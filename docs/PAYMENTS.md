# Payments (Paystack)

Co-op charges through Paystack. This is how it is wired, what is verified, and
what you have to do before the first real charge.

## The rule

**A plan changes only when Paystack says the charge succeeded.** The browser
coming back from a payment page proves nothing and changes nothing. Two
independent confirmations exist, and either one is sufficient:

| Path | Endpoint | Proof |
| --- | --- | --- |
| The owner returns to Billing | `POST /billing/payments/verify` | backend calls `GET /transaction/verify/{reference}` |
| Paystack calls us | `POST /webhooks/paystack` | `x-paystack-signature` = HMAC-SHA512 of the **raw body**, keyed with the secret |

Both are idempotent on `reference` (unique in the `payments` table), so a
duplicated webhook or a double verify cannot grant a plan twice. An
underpayment is refused: if the charge came in below the amount Co-op
recorded at checkout, the plan is not granted.

## The flow

```
Billing → "Upgrade"
  → POST /billing/checkout {plan, interval, return_url}
      · writes a `pending` row in `payments` with a fresh reference
      · returns the URL to pay at
  → the app hands that URL to the real browser
      (desktop: the allow-listed coop:shell bridge — the renderer is not
       allowed to navigate anywhere, see electron/security.js)
  → the owner pays on Paystack
  → Paystack redirects to /billing?reference=coop_…  AND sends charge.success
  → either confirmation upgrades the plan and closes any live trial
```

A charge that arrives with no checkout row (the owner opened the hosted page
directly) is still honoured: the webhook reads `business_id` and `plan` from
the charge metadata — which is signed — and records the row itself.

## Configuration

Non-secret settings live in `config/<env>.json` under `"paystack"`:

```json
"paystack": {
  "enabled": true,
  "currency": "NGN",
  "api_base": "https://api.paystack.co",
  "secret_key_env": "PAYSTACK_SECRET_KEY",
  "callback_url": "http://localhost:5173/billing",
  "allowed_callback_hosts": ["localhost", "127.0.0.1"],
  "payment_pages": {
    "starter": "https://paystack.shop/pay/cc0he0cghk",
    "professional": "https://paystack.shop/pay/8behy0j95a",
    "enterprise": "https://paystack.shop/pay/17zi09vwev"
  },
  "prices_kobo": {}
}
```

* **`payment_pages`** — plan → hosted payment page. The order above is the
  order the three pages were supplied in (starter, professional, enterprise);
  **confirm it against the dashboard** and swap lines if it is wrong. One line
  each, no code change.
* **`prices_kobo`** — empty on purpose. Each hosted page already carries the
  amount you set when you created it, so Co-op does not send one. Fill it in
  (e.g. `{"starter": {"monthly": 2900000}}`, kobo = ₦ × 100) when you want
  Co-op to own the price — then the API checkout path also works.
* **`callback_url`** — where Paystack sends the owner afterwards. In
  production set the absolute URL of the deployed Billing page, or add the
  host to `allowed_callback_hosts`; a `return_url` from the browser is only
  honoured when its host is on that list (open-redirect guard).

Secrets come from the environment only — `PAYSTACK_SECRET_KEY`
(`sk_test_…` / `sk_live_…`), see `.env.example`. It is never stored in config,
never returned by any endpoint (`GET /billing/payment-config` returns a
boolean `verification` flag instead), and never reaches the frontend.

Without the key, checkout still redirects to the hosted page — but nothing can
be verified locally and webhooks are rejected, so set it in every environment
that takes money.

## Before the first real charge

1. Confirm the plan → page mapping above.
2. Set `PAYSTACK_SECRET_KEY` on the backend.
3. In the Paystack dashboard, point the webhook at
   `https://<your-api>/webhooks/paystack`. No shared secret to copy —
   Paystack signs with the same secret key.
4. `paystack.shop` is not a standard Paystack domain (hosted pages usually live
   at `paystack.com/pay/<slug>`). Check the links open a real Paystack
   checkout before launch; if they are a redirector, replace them with the
   `paystack.com/pay/…` URLs from the dashboard.
5. Run one `sk_test_` charge end to end and confirm the plan flips and the row
   in `payments` reads `success`.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/billing/payment-config` | user | what the UI may show (never a key) |
| POST | `/billing/checkout` | user | create the pending charge, return the URL |
| POST | `/billing/payments/verify` | user | confirm a reference, upgrade if paid |
| GET | `/billing/payments` | user | this business's charge history |
| POST | `/webhooks/paystack` | signature | authoritative confirmation |

`payment_connected` in `/billing/summary` is now real: it is true when Paystack
is enabled and either a payment page or the secret key exists.

## Tests

`backend/tests/test_paystack.py` (37 tests) runs with **no network**: the API
client is driven through `httpx.MockTransport`, and the webhook tests sign
their own bodies with a test key. It covers signature acceptance and
tamper-rejection, the hosted-page URL shape, the API request shape, the
one-upgrade-only guarantee, tenant isolation, underpayment, orphan charges and
replays.

## Files

| Path | Role |
| --- | --- |
| `backend/paystack.py` | transport + config + signature checking (no database) |
| `backend/payments.py` | the `payments` ledger and the plan upgrade |
| `backend/models.py` → `Payment` | the charge row (migration `0011_payments`) |
| `frontend/src/billing/checkout.ts` | leaving the app to pay, reading `?reference=` |
| `frontend/src/billing/useBilling.ts` | checkout/verify/history state |
| `electron/security.js` | why the renderer cannot navigate, and the one bridge out |
