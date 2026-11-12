# Co-op — business plan (zero start-up capital, USD market)

**Status:** working document, 2026-11-23. Supersedes the Naira-market plan of
2026-11-06. Every number below is either measured from this repository or cited
to a public source at the end. Where a figure is a judgement rather than a fact,
it says so.

**The one-sentence business:** Co-op is the offline-first business system for
small businesses in dollar-billed markets — stock, customers, orders, invoices,
receivables and an AI advisor that cannot invent a number.

> **What changed and why.** The first version of this plan targeted Nigerian
> SMEs and priced in Naira. That was wrong for the actual product owner's market:
> the buyers are in USD economies, so the price, the tax model, the competitors
> and the payment rails all change. The Naira analysis is kept in git history
> (`docs/BUSINESS_PLAN.md` at commit `083faa1`) because it is still the right
> plan if Africa is ever revisited.

---

## 1. The wedge (and the honest weakness of this market)

The Nigerian plan had a dated, statutory demand event: e-invoicing became
mandatory in phases. **The USD market has no equivalent deadline.** US sales tax
is set per state and locality, and there is no national invoice mandate, so
"compliance software" is a weaker hook here. Pretending otherwise would be
dishonest.

What this market does have is a recurring, measurable grievance:

| Grievance | Evidence |
|---|---|
| Incumbents keep raising prices | QuickBooks Online raised every tier 15–25% on 1 May 2026 (Simple Start $30→$35, Plus $90→$110, Advanced $200→$250), and again toward $38/$85/$140/$340 in 2026 coverage |
| The cheap tier is deliberately crippled | QuickBooks Simple Start is **1 user**; multi-user starts at Essentials ($85/mo). FreshBooks charges **$11/user/month** on every plan |
| Small businesses lose work when the connection drops | every competitor in §4 is a browser app; Co-op ships an Electron + SQLite desktop build with a sync queue |
| AI features hallucinate numbers | Co-op's assistant answers **only** from verified context rows and can propose exactly one action, which the owner must confirm |

**Positioning:** *the business system that keeps working when the internet does
not, with an AI that cannot invent a number.* Three claims, each provable from
this repository (§3).

## 2. Market

| Fact | Value | Source |
|---|---|---|
| Small businesses in the US | **36.2 million** (June 2025) | USAFacts / SBA |
| Share of all US businesses | **99.9%** | USAFacts / SBA |
| Share of US private employment | **45.9%** (62.3m people) | USAFacts / SBA |
| Share of net job growth 2023–24 | **88.9%** | USAFacts / SBA |
| Previous SBA count (2024 profile) | 34.8m firms, 59.0m employees | SBA Office of Advocacy |

The addressable slice is not 36.2m. It is businesses that (a) hold inventory,
(b) invoice other businesses, and (c) have more than one person touching the
books — the segment already paying $20–$140/month for software. **A realistic
serviceable market is 1–3% of the base: 350,000–1,000,000 businesses.** That is a
judgement derived from the published competitor tiers in §4, not a measured
figure; treat it as a sizing assumption to test with real outreach, not a fact.

**Other dollar markets** (Canada, Australia, New Zealand, Singapore, the Gulf)
use the same currency and the same browser-based incumbents, so the product does
not change — only the payment processor's coverage does. The plan below treats
the US as the beachhead because it is the largest and the easiest to reach in
English.

## 3. What Co-op is, factually

Built and running today (92 API routes, 471 backend tests, 26 frontend tests):

- Products, stock movements on an append-only ledger, low-stock and reorder signals.
- Customers, orders with a validated status machine, invoices with per-business
  sequential numbering.
- **Receivables**: partial payments, balances, "who owes me money" per customer.
- **Tax**: configurable rate and label (sales tax, VAT, GST), snapshotted per
  order, printed as a separate line. Shipping default is a neutral 0% / "Tax" —
  never a pre-filled rate the owner has to notice and correct.
- **Tax-ready invoices**: supplier name, address, phone, **tax ID**,
  **company/LLC registration number**, sequential invoice number, date of
  supply, buyer, subtotal, tax rate + amount, total.
- **Offline-first desktop app** (Electron + SQLite) with a sync queue to Postgres.
- **Zeno (AI)**: answers only from verified context; proposes at most one action
  (`DRAFT_ORDER`), which the owner must confirm; remembers its own rejected
  proposals and the owner's working habits, silently (see §9.3).
- Reports, CSV/XLSX/PDF export, import with validation, audit log, team roles,
  backups, licensing/admin console.

What it deliberately does **not** do: take payments on the owner's behalf, hold
customer money, run payroll, or file taxes.

## 4. Competition and positioning (USD list prices, 2026)

| Product | What it is | Price seen | Where Co-op differs |
|---|---|---|---|
| **Wave** | free accounting + invoicing | **$0** Starter; Pro **$19/mo**; card processing 2.9% + $0.60 | Wave has no inventory and no offline app; Co-op does both |
| **Zoho Books** | full accounting suite | **free** under $50k revenue; Standard **$15/mo** (annual) / $20 monthly; Professional $40–50; Premium $60–70 | per-organisation tiers; no desktop/offline mode |
| **FreshBooks** | invoicing-first accounting | Lite **$23/mo**, Plus $43, Premium $70; **+$11 per extra user** | service-business focused, no inventory ledger |
| **QuickBooks Online** | the default | Simple Start **$38/mo** (1 user), Essentials $85, Plus $140, Advanced $340 | Co-op is cheaper at multi-user and works offline |
| **Xero** | full-ledger accounting | **$25–$90/mo**, unlimited users | browser-only; no stock ledger depth |
| **Odoo** | ERP | per-user, implementation help needed | Co-op is self-serve, one download |

**Positioning, stated as a claim a customer can check in ten minutes:**

1. **It cannot lie about your money.** The assistant is given only verified rows
   and may state nothing else; it can propose one action and cannot execute it.
2. **It works offline.** SQLite + sync queue; every competitor above is a web app.
3. **It is priced per business, not per seat.** $29 or $99 flat, no $11/seat,
   no "multi-user starts at $85".

Price is not the differentiator — Wave is free. The differentiator is
**consequence**: a wrong number costs a small business money, and every incumbent
above has an incentive to sell the upgrade rather than the number.

## 5. Pricing (USD, set from the compared list prices)

| Plan | Price | Annual (20% off) | AI credits/mo | Comparable |
|---|---|---|---|---|
| Free | $0 | — | 25 | entry, no card |
| **Starter** | **$29/mo** | $278.40 | 200 | above Zoho Standard ($15–20), below QuickBooks Simple Start ($38) |
| **Professional** | **$99/mo** | $950.40 | 1,000 | above FreshBooks Premium ($70), below QuickBooks Plus ($140) |
| Enterprise | contact | — | unlimited | multi-outlet, support SLA |

Why these numbers: Starter must read as "cheaper than QuickBooks, more than the
free tiers", and Professional must read as "the whole back office for less than
QuickBooks Essentials plus a seat". Both sit inside the published range above, and
both leave room for a **50% founding-customer price** that costs nothing to give
and creates urgency without a discount coupon culture.

**Unit economics per Starter customer (measured inputs, modelled outputs):**

| Rail | Fee on $29 | Share of revenue | Monthly margin before AI |
|---|---|---|---|
| Paystack (USD, from a Nigerian entity) | 3.9% + ₦100 ≈ **$1.20** | 4.1% | **$27.80 (96%)** |
| Stripe (US entity) | 2.9% + $0.30 = **$1.14** | 3.9% | **$27.86 (96%)** |

Hosting is $0 until roughly 50–100 active businesses (free tiers); the database is
Supabase free tier at the start. The AI ceiling implied by the plan is
**$0.145 per credit** ($29 ÷ 200). At Professional, $99 ÷ 1,000 = $0.099 per
credit. **That ceiling is modelled, not measured** — instrument OpenRouter cost
per business in the first month of real usage; it is the single most important
number in this document.

## 6. Payment rails — the constraint that decides the first 90 days

This is the part most plans skip, and it is the part that can stop revenue.

| Fact | Consequence |
|---|---|
| **Stripe does not support Nigeria-registered businesses** | a US checkout cannot be opened with a Nigerian entity |
| Paystack supports **USD settlement** from a Nigerian account: 3.9% per USD transaction, settled to a GTB domiciliary account **7 working days** after payment (announced 2020 as a public beta — verify current availability before launch) | fastest zero-capital route: keep the Nigerian entity, enable USD, charge in USD |
| Stripe Atlas forms a **Delaware C-corp or LLC for a one-time $500** (state filing, EIN, first-year registered agent), open to founders anywhere | the route to Stripe's 2.9% + $0.30, and to a US bank account |
| Delaware costs after year one: ~$100 registered agent + state franchise tax | a real recurring cost, not a one-off |

**Decision:** launch on **Paystack USD** (no new entity, no cash), and open the
Stripe Atlas route **only when MRR justifies $500 plus the annual compliance**.
Pricing is identical on both rails; only the fee line changes by ~$0.06.

## 7. Zero-capital operating plan

The constraint is real: no money. Everything below is free or deferred.

**0–30 days — sell before building anything else**

| Action | Cost | Why |
|---|---|---|
| 10 design-partner calls with small businesses that invoice other businesses | $0 | the only thing that matters: does the pain get someone to pay |
| Onboard 3 paying design partners at a **50% founding price** ($14.50/mo) | $0 | cash + testimonials + the reference list investors ask for |
| Record a 3-minute demo: offline order → invoice → receivable, network unplugged | $0 | the sales asset; no website needed |
| Publish the "works offline" comparison page | $0 | the one claim no incumbent can copy quickly |
| Set up Paystack USD (or confirm it is still available) | $0 | without a rail there is no revenue |

**30–90 days — prove repeatability**

- 15 paying businesses, **≥$300 MRR**, churn measured weekly (not assumed).
- Instrument AI cost per business; if a Starter customer's AI cost exceeds
  **$3/month**, cut credits or raise price.
- **The bookkeeper channel**: a bookkeeper or accountant serves 10–50 small
  businesses and is judged on clean books. Offer a revenue share, not a discount.
- Apply to **Google for Startups** ($100,000 in Google Cloud credits,
  equity-free, for eligible African startups) — removes hosting cost entirely.
- Apply to **Y Combinator** (standard deal **$500,000**: $125,000 for 7% plus a
  $375,000 uncapped MFN SAFE; ~40% of a batch is pre-revenue at entry). Apply
  early and repeatedly; the application itself forces the clarity this plan is
  trying to build.

**90–180 days — raise from strength**

- Target **Google for Startups Black Founders Fund** (up to **$100,000**,
  non-dilutive) — needs a working product and traction, which is what the 90-day
  plan produces.
- Pre-seed conversations only after the numbers exist. Open with retention and
  unit economics; the market-size slide is table stakes, not the pitch.
- **Only then** consider Stripe Atlas ($500) if the Paystack rail is costing
  customers at checkout.

**The only unavoidable cash before public launch** (already in
`docs/GO_LIVE_COSTS.md`): a **Windows code-signing certificate (~$120–400/yr)**
once an installer ships. Until then, distribute GitHub Actions builds and accept
the SmartScreen warning — which, for a US buyer downloading from an unknown
vendor, is a real conversion cost, not a cosmetic one.

**Equity discipline:** grants first (no dilution), revenue second, equity last.
At $29, 100 paying businesses is **$2,900/month** — enough to fund the company
without selling it.

## 8. Measuring it (built, not aspirational)

The original version of this plan had a table of targets and no way to check
them. The metrics now exist in the product: **Admin console → Fundraising**
(`GET /platform/investor-metrics`) computes signups, activation (first invoice
within 7 days), week-over-week retention, MRR and AI credits per paying business
from the ledgers, and prints the definition of each next to the number. The same
endpoint produces the one-line traction sentence for an investor or accelerator
application, so the dashboard and the application cannot disagree. See
`docs/YC_APPLICATION.md` for how each number is used.

## 9. Go-to-market (no ad budget)

1. **The bookkeeper channel.** One bookkeeper with 30 clients is worth more than
   1,000 impressions. They are also the person who has to fix bad books, so an
   offline-capable system that produces clean exports is a tool, not a threat.
2. **Vertical communities with rules respected** — the accounting and small-business
   subreddits, bookkeeping Facebook groups, and trade associations. Answer
   questions; never spam.
3. **Content in the language of the pain** — "invoice software that works without
   internet", "QuickBooks alternative for 5 users", "why our AI won't make up a
   number". These are searches with commercial intent and almost no incumbent
   competition.
4. **Migration as the offer.** Free import of a QuickBooks/Zoho/Wave CSV. The
   switching cost is the moat the incumbents rely on; remove it explicitly.
5. **One launch, once.** Product Hunt / Hacker News "Show HN" when the offline
   demo exists. A launch without a demo video wastes the only free spike you get.

## 10. What this pass changed in the product to match the plan

Detailed in `docs/PRODUCT_MARKET_FIT_AUDIT.md`; summarised:

1. **USD pricing end to end** — `$29` / `$99` in the catalogue and in
   `config/<env>.json` (`prices_kobo` now holds **cents**, currency `USD`), with
   the payment tests pinned to those figures.
2. **Neutral tax defaults** — a new business gets **0% / "Tax"** instead of
   Nigeria's 7.5% VAT (migration `0024_tax_defaults`). Sales tax is set per state
   and county, so a pre-filled rate is a number the owner must notice and fix.
   The invoice now prints the **label the owner chose**, not a hard-coded "VAT".
3. **Invisible adaptation** — the Settings → AI Learning panel is gone. Zeno
   still learns (graded mistakes from rejected proposals, plus working habits it
   observes), but nothing about it is shown, counted or asked about. The gates
   that replaced the human review are in §10 of the audit.
4. **Generic invoice identity block** — tax ID and registration number, labelled
   "Tax ID" and "Reg. no.", with the statutory citation generalised away from
   Nigeria-only wording.

## 11. Risks, honestly

| Risk | Likelihood | Mitigation |
|---|---|---|
| The market is crowded and incumbents are trusted | **high** | sell the one thing they cannot do quickly (offline) and the one thing they will not do (flat per-business pricing) |
| No compliance deadline to force a purchase decision | **high** | sell consequence and price, not a date |
| SMB churn is high and support is expensive for a solo founder | high | cap onboarding at 3/week until support load is measured; publish answer-first docs |
| A Nigerian entity is a trust objection for a US buyer | medium | publish the security audit, the licence terms and a data-processing page; use Stripe Atlas entity once revenue justifies it |
| Paystack USD availability is a beta, not a guarantee | medium | confirm before promising checkout; Stripe Atlas is the fallback |
| AI cost per credit exceeds the ceiling | medium | measure in month 1; cut credits or raise price before scaling |
| Sales tax advice is wrong | medium | the app computes what the owner configures and never claims to be tax advice |
| Time-zone support (WAT vs US hours) | medium | publish support hours; use async video answers |
| Single founder, no runway | high | grants first, revenue second, fixed costs at zero |

## 12. What we will not do

- No lending/credit product (needs a licence and capital).
- No payment collection on behalf of the merchant (regulatory surface).
- No marketplace/storefront (that is Shopify/Bumpa's game).
- No custom ERP implementation work.
- No paid ads before 25 paying customers.
- No "AI that does your books" claim. The AI answers questions; the owner decides.

## Sources

- **US small business statistics** — 36.2m firms, 99.9%, 45.9% of private
  employment, 88.9% of 2023–24 job growth: [USAFacts, "What role do small
  businesses play in the economy?" (Dec 2025)](https://usafacts.org/articles/what-role-do-small-businesses-play-in-the-economy/);
  34.8m / 59.0m employees: [SBA Office of Advocacy, 2024 Small Business
  Profile (PDF)](https://advocacy.sba.gov/wp-content/uploads/2024/11/United_States.pdf),
  [SBA press release](https://advocacy.sba.gov/2024/11/19/new-advocacy-report-shows-small-business-total-reaches-34-8-million-accounting-for-2-6-million-net-new-jobs-in-latest-year-of-data/)
- **Competitor pricing (2026)** — [QuickBooks/Xero/FreshBooks/Zoho/Wave comparison](https://acculinkcpa.com/blog/quickbooks-online-vs-xero-vs-sage-vs-freshbooks-vs-zoho-books-complete-comparison),
  [invoicing software ranking with fee tables](https://agiled.app/blog/best-invoicing-software-for-small-businesses),
  [plan-by-plan table](https://credence-intel.com/small-business-tools/),
  [QuickBooks 2026 increase analysis](https://buyersprint.com/2026/05/04/quickbooks-alternatives-small-business-2026/)
- **Stripe fees** — 2.9% + $0.30 domestic card: [Stripe fee explainer (Sep 2026)](https://checkoutpage.com/blog/stripe-processing-fees), [2026 fee review](https://digijaws.com/reviews/stripe-review/)
- **Stripe availability in Nigeria** — Nigeria is not a supported country:
  [Mazino Oyolo (Feb 2026)](https://mazinooyolo.com/blog/stripe-account-in-nigeria/),
  [Silicon Africa](https://siliconafrica.org/how-to-open-a-stripe-account-in-nigeria/)
- **Stripe Atlas cost** — $500 one-time, any founder, includes EIN and first-year
  agent: [Stripe Atlas guide (Jul 2026)](https://guptadeepak.com/startup-offers/guides/stripe-atlas),
  [Atlas vs alternatives (Oct 2026)](https://www.globalsolo.global/blog/stripe-atlas-vs-firstbase-vs-doola-pricing-comparison-2026)
- **Paystack USD settlement** — 3.9% on USD transactions, 7-working-day
  settlement to a GTB domiciliary account, announced as a public beta:
  [Paystack blog](https://paystack.com/blog/product/new-accept-payments-in-usd);
  local NGN pricing 1.5% + ₦100: [review](https://www.paymentprocessingguide.com/processor/paystack)
- **Y Combinator standard deal** — $500k ($125k for 7% + $375k uncapped MFN):
  [Roundfunded (Nov 2026)](https://www.roundfunded.com/en/blogs/yc-standard-deal-equity-explained-2026),
  [startzero](https://startzero.money/blog/y-combinator-guide)
- **Invoice identity fields** — the strictest published statement that an invoice
  must carry the supplier's tax ID and registration number is Nigeria's
  [NTA 2025 s.153 summary](https://invoicequickly.com/blog/invoice-requirements-nigeria);
  the app treats that list as a superset of what US/UK/EU invoices show.
- **Paystack local fee and caps** — confirm on the dashboard before modelling;
  published Nigerian pricing is 1.5% + ₦100 above ₦2,500, capped at ₦2,000.
