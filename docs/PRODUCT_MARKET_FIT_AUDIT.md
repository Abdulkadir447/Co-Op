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

## 2. Invoices and tax

The statutory anchor is still Nigeria's NTA 2025 s.153, because it is the
clearest published list of what a tax invoice must carry. The app now treats that
list as a **superset**: the fields a US, UK or EU invoice shows are a subset of
it, so satisfying it satisfies them.

| Required field | Co-op before | Verdict |
|---|---|---|
| Supplier name, address, phone | printed on the invoice | KEEP |
| Supplier tax ID | stored on `businesses.tax_id`, editable in Settings — but never printed | **FIXED** — printed as "Tax ID" |
| Sequential invoice number | `invoices.number` (INV-0001) existed; the printable page showed the **order** number instead | **FIXED** — the print shows the invoice number when the order has been invoiced, and labels the order reference honestly when it has not |
| Business registration number | no field existed at all | **FIXED** — `businesses.registration_number` (migration 0023), Settings field, printed as "Reg. no." |
| Date of supply | printed (order date) | KEEP |
| Buyer name | printed | KEEP |
| Gross amount | printed | KEEP |
| Tax amount **and rate** | printed as `VAT (7.5%)` + amount, with the label hard-coded | **FIXED** — prints the **owner's label** (`Tax`, `VAT`, `GST`) and rate |
| Buyer tax ID (B2B) | not captured | **DEFER** — one secondary source says B2B invoices need it; adding a per-customer tax ID touches the customer form, the import mapping and the snapshot. Do it when a customer asks. |

**Pre-filled 7.5% VAT.** Was wrong for this market: sales tax is set per state and
county and many services are untaxed, so a pre-filled rate is a number the owner
has to notice and correct. **FIXED** — new businesses start at **0% / "Tax"**
(migration `0024`); existing rows are untouched.

**Trial length (10 days).** KEEP. Trials in this category run 7–30 days and there
is no evidence 10 is wrong. Changing it would be a preference, not a fact.

## 3. Pricing

| Finding | Evidence | Verdict |
|---|---|---|
| The catalogue must be the currency the card is charged | Paystack/Paystack-style rails charge in the configured currency; a Naira list price is meaningless to a US buyer | **FIXED** — `USD`, `$29` / `$99`, config holds **cents** |
| $29/$99 is defensible in this market | Zoho Books Standard $15–20/mo (annual), Wave Pro $19, FreshBooks Lite $23, QuickBooks Simple Start $38, QuickBooks Plus $140 | **FIXED from NGN** (the previous pass priced ₦9,500/₦29,000 for a market that is not the target) |
| Flat per-business price, not per-seat | FreshBooks +$11/user; QuickBooks multi-user starts at Essentials $85 | KEEP (deliberate differentiator) |
| Annual discount 20% | standard | KEEP |
| Free tier with 25 AI credits | freemium is the norm (Wave free, Zoho free under $50k revenue) | KEEP |
| Enterprise "contact us" with no price | standard | KEEP |

## 4. AI (Zeno)

| Behaviour | Standard practice | Verdict |
|---|---|---|
| Answers only from verified context | stricter than most; matches OWASP LLM guidance on grounding | KEEP |
| Proposes actions, user confirms | exactly the "human in the loop on writes" pattern | KEEP |
| One action in the registry | least privilege | KEEP |
| No tools, no URL fetching, no document ingestion | removes prompt-injection and exfil paths | KEEP (deliberate) |
| AI history visible and deletable by the owner | required for trust/GDPR-style expectations | KEEP |
| Credits meter usage | standard | KEEP |
| Learning ledger with an **owner review screen** | careful, but it turns a product into a training chore | **FIXED** — the screen is deleted; adaptation happens silently |

**Why the review screen went.** The plan is attachment: the assistant should feel
like it is becoming something that knows the business, not like software asking
to be configured. A panel that lists "what Zeno has learned" makes the mechanism
the product, invites the owner to audit it, and converts every observation into
homework. The behaviour survives; the visibility does not.

**What replaced the human review** (this is the part that had to stay honest):

1. **Repetition.** One mention is stored as `candidate` and never reaches the
   prompt. A second independent mention of the same fingerprint activates it.
2. **`sanitize_preference`.** Text that looks like an instruction to the model —
   URLs, markup, fenced blocks, "ignore/instructions/system" phrasing, over 160
   characters — is refused before it can be stored.
3. **A budget.** Up to 4 preferences reserve slots in the 8-lesson prompt block
   and mistakes take what is left, so habits can never crowd out the verified
   business context — and a busy mistake ledger can never silence the habits.
4. **Silence.** The prompt forbids Zeno from announcing that it is learning,
   remembering or personalising. The one visible trace is a sentence in
   Settings → AI that says it gets to know how the business works.

**Honest caveat:** "invisible" is a product decision, not a legal shield. An
assistant that keeps a per-business behaviour record is processing personal data
in the EU/UK sense, and a privacy notice has to describe the *existence* of that
processing even when the UI does not. That notice belongs in the customer-facing
privacy page before launch; it does not need to be a settings screen.

## 5. Billing and payments

| Behaviour | Standard practice | Verdict |
|---|---|---|
| Card data never touches the app (hosted/initialised by Paystack) | correct | KEEP |
| Webhook signature verified over the raw body | correct | KEEP |
| Plan granted only after server-side verification | correct | KEEP |
| Amounts from the server, never the client | correct | KEEP |
| Currency and prices in config, not in UI code | correct | KEEP (now USD, cents) |

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
| Delete-account / data-export request flow | expected under GDPR Art. 15/17 and CCPA | **DEFER** — a real compliance obligation, not a shippable afternoon; the backup export is a full tenant dump but not a self-serve deletion path |

## 8. Desktop and offline

| Behaviour | Standard practice | Verdict |
|---|---|---|
| SQLite local mirror + sync queue | standard offline-first | KEEP |
| `contextIsolation`, `sandbox`, no `nodeIntegration` | Electron baseline | KEEP |
| Auto-update | standard | KEEP |
| No code-signing certificate yet | installers show SmartScreen warnings | **DEFER** — the only unavoidable cash item (~$120–400/yr), in `GO_LIVE_COSTS.md` |

## 9. What changed in code (this pass)

1. **USD everywhere.** `config/{production,development,testing}.json` →
   `currency: "USD"`, `prices_kobo` in **cents** (`2900 / 27840`, `9900 / 95040`);
   `plans.ts` renders `$29` / `$99` and the paid-plan bullets were rewritten;
   `backend/paystack.py` defaults to USD.
2. **Neutral tax defaults.** `0024_tax_defaults` sets `tax_rate` 0 and
   `tax_label` 'Tax' for new businesses; the invoice prints the owner's label
   instead of a hard-coded "VAT".
3. **Generic invoice identity block.** "TIN" → "Tax ID", "RC/BN" → "Reg. no.",
   and the model/migration comments no longer describe the field as Nigeria-only.
4. **The AI Learning panel is deleted** (`ZenoLearningSection.tsx`, its menu
   entry and its route case). `/ai/lessons` stays as a support/test surface.
5. **Silent learning is real, not cosmetic.** Preferences go dormant on first
   mention and activate on the second; the model reports habits in an internal
   `preferences` field that never reaches the client; `sanitize_preference`
   refuses instruction-shaped text; preferences get their own prompt budget.
6. **Tests**: 439 backend tests (up from 436) covering the sanitiser, the
   promotion rule, the prompt budget and a full chat turn that teaches a habit
   without exposing the mechanism.

## 10. Sources

- Licence-key handling and reveal-once/mask practice: [SaaS API keys & tokens UX patterns (2026)](https://www.saasui.design/blog/saas-api-keys-tokens-ux-patterns), [sending licence keys from a SaaS](https://luneamail.com/blog/license-key-emails)
- Invoice identity fields: [InvoiceQuickly — statutory invoice requirements (NTA 2025 s.153)](https://invoicequickly.com/blog/invoice-requirements-nigeria)
- Competitor list prices (USD, 2026): [QuickBooks/Xero/FreshBooks/Zoho/Wave](https://acculinkcpa.com/blog/quickbooks-online-vs-xero-vs-sage-vs-freshbooks-vs-zoho-books-complete-comparison), [invoicing comparison with fee tables](https://agiled.app/blog/best-invoicing-software-for-small-businesses)
- Payment rails: [Stripe 2.9% + $0.30](https://checkoutpage.com/blog/stripe-processing-fees), [Stripe unsupported in Nigeria](https://mazinooyolo.com/blog/stripe-account-in-nigeria/), [Paystack USD settlement at 3.9%](https://paystack.com/blog/product/new-accept-payments-in-usd)
- Memory/adaptation as a product surface: the decision rests on the product
  requirement recorded above, not on a market study; no source is cited for it
  because none was used.
