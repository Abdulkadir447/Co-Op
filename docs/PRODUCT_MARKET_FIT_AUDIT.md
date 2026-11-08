# Feature fit audit — is this how it is supposed to work?

Every feature in `docs/FEATURE_INVENTORY.md`, checked against how established
products and the relevant regulation actually do it. Three verdicts:

- **KEEP** — matches standard practice; no change.
- **FIXED** — was wrong or missing; changed in this pass (commit noted in §7).
- **DEFER** — a real gap, not fixed here, with the reason.

Research sources are listed at the end. Nothing in this document is a preference
of mine; where a claim is a judgement it says so.

---

## 1. The licence key — should the customer see it?

**Short answer: yes, the owner should see it — and only the owner, and only as a
reference.** That is what the research says, and it is what the code now does.

What the guidance actually says:

- A licence key **must be recoverable in the account**, because an emailed key
  gets lost, and a product that can only show it once leaves a paying customer
  locked out of their own purchase. ("Show the key in the account too, and let
  the owner replace it. A leaked email then has a fix.")
- For secrets that grant access, the standard UX is **show once at creation,
  then mask** — a page that re-renders a full credential over someone's shoulder
  or into a support screenshot undermines itself.
- The key must never be in logs, never in an email subject, and re-sending must
  only ever go to the address on the order.

How Co-op behaves, measured:

| Question | Before this pass | Now |
|---|---|---|
| Does the server store the key itself? | **No** — only a SHA-256 fingerprint (`licensing.py`) | unchanged, correct |
| Can a non-owner read licence state? | **Yes** — `GET /licenses` had no owner dependency, while the UI hid the section from non-owners | **No** — `require_owner`, matching the UI. A viewer gets 403. |
| Does the UI show the key? | No — it shows plan, seats, expiry and a 64-char **hash** | No — a hash is not useful to a person; it now reads as a short **licence reference** |
| Is the key anywhere in the frontend bundle? | No | No |

So the answer to "is the customer supposed to see their licence key": the
**owner** sees a reference and the licence state (plan, seats, expiry) — that is
standard. The **key string** itself is only needed to activate a new device, and
there it is presented as the input, not as a stored value to display. Other team
members should not see it at all, which is now enforced by the API rather than
only by hiding a menu item.

**Why this matters beyond tidiness:** a licence is a bearer credential. Hiding a
section in the UI while the API still answers is the classic broken-access-control
pattern (OWASP #1), and it is exactly what this feature had.

## 2. Invoicing and VAT

The Nigeria Tax Act 2025 (s.153) requires these on a VAT invoice: supplier Tax
ID, invoice number from a sequential series, supplier name and address,
**incorporation or business registration number**, date of supply, buyer name,
gross amount, and the VAT amount with its rate.

| Required field | Co-op before | Verdict |
|---|---|---|
| Supplier name, address, phone | printed on the invoice | KEEP |
| Supplier Tax ID (TIN) | stored on `businesses.tax_id` and editable in Settings — but **never printed** | **FIXED** — printed |
| Sequential invoice number | `invoices.number` (INV-0001) existed; the printable page showed the **order** number instead | **FIXED** — the print shows the invoice number when the order has been invoiced, and labels the order reference honestly when it has not |
| Business registration number | **no field existed at all** | **FIXED** — `businesses.registration_number` (migration 0023), Settings field, printed |
| Date of supply | printed (order date) | KEEP |
| Buyer name | printed | KEEP |
| Gross amount | printed | KEEP |
| VAT amount **and rate** | printed as `VAT (7.5%)` + amount | KEEP |
| Buyer TIN (B2B) | not captured | **DEFER** — the statutory list above names the buyer, not the buyer's TIN; one secondary source says B2B invoices need it. Adding a per-customer TIN is cheap but touches the customer form, import mapping and the snapshot. Do it when an accountant confirms it is required for your customers. |

**Trial length (10 days).** KEEP. Trials in this category run 7–30 days and there
is no evidence 10 is wrong. Changing it would be a preference, not a fact.

**VAT rate default 7.5%.** KEEP — the 2025 Act retains 7.5%.

## 3. Pricing

| Finding | Evidence | Verdict |
|---|---|---|
| $29/$99/month is unsellable to this market | at ~₦1,348/USD that is ₦39,000/₦133,500; competitors are ₦5,000–₦20,000 (POS), ₦10,000 (Fisco Pro), ₦27,000–₦55,500 (Odoo), ₦25,000–₦60,000 (Zoho bundle) | **FIXED** — ₦9,500 Starter / ₦29,000 Professional, currency NGN |
| Annual discount | 20% is standard | KEEP |
| Free tier with 25 AI credits | freemium is the norm in this market (Fisco has a free starter) | KEEP |
| Enterprise "contact us" with no price | standard | KEEP |

## 4. AI (Zeno)

| Behaviour | Standard practice | Verdict |
|---|---|---|
| Answers only from verified context | stricter than most; matches OWASP LLM guidance on grounding | KEEP |
| Proposes actions, user confirms | exactly the "human in the loop on writes" pattern | KEEP |
| One action in the registry | least privilege | KEEP |
| No tools, no URL fetching, no document ingestion | removes prompt-injection and exfil paths | KEEP (deliberate) |
| Learning ledger, preferences need owner acceptance | memory without silent rule changes | KEEP |
| AI history visible and deletable by the owner | required for trust/GDPR-style expectations | KEEP |
| Credits meter usage | standard | KEEP |

## 5. Billing and payments

| Behaviour | Standard practice | Verdict |
|---|---|---|
| Card data never touches the app (hosted/initialised by Paystack) | correct | KEEP |
| Webhook signature verified over the raw body | correct | KEEP |
| Plan granted only after server-side verification | correct | KEEP |
| Amounts from the server, never the client | correct | KEEP |
| Currency and prices in config, not in UI code | correct | KEEP (now NGN) |

## 6. Team, roles and access

KEEP. Owner-only surfaces are enforced server-side (`assert_can_write`,
`require_owner`) and refusals now emit a security event. The one gap closed here
was `/licenses` (§1).

## 7. Data, audit and backups

| Behaviour | Standard practice | Verdict |
|---|---|---|
| Append-only audit log of mutations | expected in an accounting-adjacent product | KEEP |
| Soft deletes | expected | KEEP |
| Tenant isolation tested cross-tenant | expected | KEEP |
| Backup export is a full tenant dump, owner-only, no expiry/encryption | risky | **DEFER** — needs encrypted-at-rest storage and signed expiring downloads; documented in `SECURITY_AUDIT.md` as open item 2 |
| Delete-account / data-export request flow (NDPA) | expected under Nigeria's Data Protection Act | **DEFER** — a real compliance obligation, not a shippable afternoon |

## 8. Desktop and offline

| Behaviour | Standard practice | Verdict |
|---|---|---|
| SQLite local mirror + sync queue | standard offline-first | KEEP |
| `contextIsolation`, `sandbox`, no `nodeIntegration` | Electron baseline | KEEP |
| Auto-update | standard | KEEP |
| No code-signing certificate yet | installers show SmartScreen warnings | **DEFER** — the only unavoidable cash item (~$120–400/yr), in `GO_LIVE_COSTS.md` |

## 9. What I changed in code (this pass)

1. `businesses.registration_number` — model, migration `0023_invoice_compliance`,
   settings schema, Settings → Company field, Supabase snapshot.
2. Printable invoice — prints TIN, registration number, and the **invoice
   number** when the order has been invoiced (falls back to a clearly-labelled
   order reference), plus the date of supply line.
3. `GET /licenses` — owner-only, with a test proving a non-owner gets 403.
4. Licence UI — the stored hash is shown as a short reference, not a meaningless
   64-character string.
5. Pricing — NGN catalogue (₦9,500 / ₦29,000), config `prices_kobo` in kobo for
   Paystack, currency `NGN`, and the tests that pin those figures updated.

## 10. Sources

- Licence-key handling and reveal-once/mask practice: [SaaS API keys & tokens UX patterns (2026)](https://www.saasui.design/blog/saas-api-keys-tokens-ux-patterns), [sending licence keys from a SaaS](https://luneamail.com/blog/license-key-emails)
- Nigerian VAT invoice content and e-invoicing phases: [InvoiceQuickly — VAT invoice requirements](https://invoicequickly.com/blog/invoice-requirements-nigeria), [LeafTally — NRS e-invoicing 2026](https://leaftally.com/blogs/nrs-e-invoicing-nigeria-2026-compliance-guide/), [Baker Tilly Nigeria](https://www.bakertilly.ng/insights/nigerias-2025-tax-reform-acts-explained)
- Competitor and market pricing: [CliqPOS 2026 price guide](https://cliqpos.com/pos-system-price-nigeria-2026), [Fisco comparison](https://www.usefisco.com/blog/best-business-management-software-for-small-businesses-in-nigeria), [SoftwareSuggest Nigeria](https://www.softwaresuggest.com/point-of-sale-pos-software/nigeria)
- FX: [Monierate CBN rates, Nov 2026](https://monierate.com/fx/official)
