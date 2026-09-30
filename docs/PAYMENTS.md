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
  "currency": "USD",
  "api_base": "https://api.paystack.co",
  "secret_key_env": "PAYSTACK_SECRET_KEY",
  "callback_url": null,
  "allowed_callback_hosts": [],
  "payment_pages": {},
  "prices_kobo": {
    "starter": { "monthly": 2900, "annual": 27600 },
    "professional": { "monthly": 9900, "annual": 94800 }
  }
}
```

* **`payment_pages`** — plan → hosted payment page. **Empty on purpose.** The
  three `paystack.shop/pay/…` links were removed: that is not a Paystack
  domain, so a charge taken through it could neither be trusted nor traced.
  The hosted-page code path is still supported — add a real
  `paystack.com/pay/<slug>` URL here and Co-op will prefer it over the API.
* **`prices_kobo`** — what Co-op charges, in the currency's minor unit (USD
  cents, despite the legacy name). These are the figures the pricing screen
  already displays (`frontend/src/billing/plans.ts`): Starter $29/mo and
  Professional $99/mo, each with a 20% annual discount. The annual amounts are
  the UI's displayed monthly-equivalent × 12 — $23 × 12 = $276 and
  $79 × 12 = $948. **Confirm them before taking real money:** the UI rounds
  the monthly figure first, which is not the same as 20% off the yearly total
  ($278.40 / $948.00).
* **Enterprise is absent on purpose** — it is "Contact Sales", so there must
  be no price to charge. `POST /billing/checkout` returns 422 for it and the
  pricing card shows no buy button.
* **`callback_url`** — where Paystack sends the owner afterwards. In
  production set the absolute URL of the deployed Billing page, or add the
  host to `allowed_callback_hosts`; a `return_url` from the browser is only
  honoured when its host is on that list (open-redirect guard).

Secrets come from the environment only — `PAYSTACK_SECRET_KEY`
(`sk_test_…` / `sk_live_…`), see `.env.example`. It is never stored in config,
never returned by any endpoint (`GET /billing/payment-config` returns a
boolean `verification` flag instead), and never reaches the frontend.

**The key is now mandatory, not optional.** With the hosted pages removed
there is no other way to start a charge: without `PAYSTACK_SECRET_KEY`,
`GET /billing/payment-config` reports every plan as `checkout_enabled: false`,
the pricing cards show no buy button, and `POST /billing/checkout` returns 422.
That is deliberate — a button that cannot complete a charge is worse than no
button.

### Deployment overrides (environment)

Two settings differ per deployment rather than per environment, so they can be
supplied from the environment instead of committing them:

| Variable | Effect |
| --- | --- |
| `PAYSTACK_CALLBACK_URL` | Overrides `paystack.callback_url`. Set it to the absolute URL of the deployed Billing page. |
| `PAYSTACK_ALLOWED_CALLBACK_HOSTS` | **Adds to** `paystack.allowed_callback_hosts` (comma-separated). A full URL is accepted and reduced to its hostname. |

On a host such as Render these go in the service's environment alongside
`PAYSTACK_SECRET_KEY`, which keeps the live URL out of git. The config file
still holds the defaults, and the file's allow-list is never replaced — only
extended — so an operator cannot accidentally widen it by typo.

## Before the first real charge

1. Confirm the `prices_kobo` figures match what the pricing screen shows *and*
   what you intend to charge. The annual amounts are derived from the UI's
   rounded monthly figure, not decided independently.
2. Set `PAYSTACK_SECRET_KEY` on the backend. Without it nothing is buyable.
3. In the Paystack dashboard, point the webhook at
   `https://<your-api>/webhooks/paystack`. No shared secret to copy —
   Paystack signs with the same secret key.
4. Set `PAYSTACK_CALLBACK_URL` to the absolute URL of the deployed Billing page.
5. Run one `sk_test_` charge end to end and confirm the plan flips and the row
   in `payments` reads `success`. `scripts/paystack_live_smoke.py` proves the
   key authenticates and the API round-trips without capturing a card.

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
