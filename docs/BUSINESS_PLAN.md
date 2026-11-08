# Co-op — business plan (zero start-up capital)

**Status:** working document, 2026-11-06. Every number below is either measured
from this repository or cited to a public source at the end. Where a figure is a
judgement rather than a fact, it says so.

**The one-sentence business:** Co-op is the offline-first business system for
Nigerian SMEs that has to survive a dead network and a tax audit — stock,
customers, orders, VAT invoices and an AI advisor that cannot invent a number.

---

## 1. Why now: the compliance deadline is the wedge

Nigeria's 2025 tax reform replaced the FIRS with the Nigeria Revenue Service and
made **electronic invoicing mandatory in phases**. Large taxpayers went live in
November 2025; medium taxpayers (₦1bn–₦5bn turnover) by **1 July 2026**; small
and emerging businesses by **1 July 2027**, with enforcement after that.

At the same time the **VAT rate stays at 7.5%**, and a compliant VAT invoice must
carry a specific set of details — supplier Tax ID, invoice number, supplier name
and address, **incorporation/registration number**, date of supply, buyer name,
gross amount, and the VAT amount with its rate.

The consequence is concrete and near-term: **every registered SME in Nigeria
will need software that issues a compliant invoice, or a compliant invoice will
not exist.** Today that work is done in Word templates, WhatsApp and paper.

That is a demand event with a date attached — the single best thing a
zero-capital founder can have, because it sells itself without a marketing
budget. Co-op already stores a TIN, a per-business sequential invoice number, a
VAT rate snapshotted per order, and an exclusive tax calculation. In this pass I
closed the remaining gaps to the statutory field list (registration number on the
invoice; see §9 and `docs/PRODUCT_MARKET_FIT_AUDIT.md`).

**Honest caveat:** the sources disagree about the exact small-business date
(some report 1 January 2026 for medium and small VAT-registered businesses, others
the phased July 2026 / July 2027 schedule). The direction is not in dispute; the
date is. Sell the direction, verify the date with an accountant before putting it
on a slide.

## 2. Market

| Fact | Value | Source |
|---|---|---|
| MSMEs in Nigeria | **39.65 million** | SMEDAN/NBS MSME Survey |
| Share of all businesses | 96.9% | SMEDAN/NBS |
| Share of national employment | 87.9% | SMEDAN/NBS |
| Contribution to GDP | 46.3–49.7% | SMEDAN/NBS |
| Nano + micro enterprises | 33.0m + 5.9m (≈98%) | SMEDAN/NBS |

The addressable slice is not 39.6m. It is the subset that already pays for
software or bookkeeping: **small and medium enterprises** (≈1.24m by SMEDAN's
count) plus the upper band of micro businesses that invoice other businesses.
A realistic serviceable market is **100,000–300,000 businesses** — judgement,
derived from the SME count and the observed number of paying customers at
comparable Nigerian products (Bumpa reports 60,000–100,000+ merchants).

**Market validation already exists.** Bumpa raised a **$200,000 pre-seed in 2021**
and a **$4m seed led by Base10 Partners in 2022**, on the thesis that Nigerian
small businesses need retail automation. Kippa, OZÉ and Pastel are pursuing the
same customer. The category is funded and real; the differentiation question is
§4, not "is there a market".

## 3. What Co-op is, factually

Built and running today (91 API routes, 434 backend tests, 26 frontend tests):

- Products, stock movements with an append-only ledger, low-stock and reorder signals.
- Customers, orders with a validated status machine, invoices with per-business
  sequential numbering.
- **Receivables**: partial payments, balances, "who owes me money" per customer.
- **VAT**: 7.5%-capable, exclusive, rate snapshotted per order, printed on the invoice.
- **Offline-first desktop app** (Electron + SQLite) with a sync queue back to Postgres.
- **Zeno (AI)**: answers only from verified context; proposes at most one action
  (`DRAFT_ORDER`), which the owner must confirm; a graded lesson ledger that
  remembers mistakes it was caught making.
- Reports, CSV/XLSX/PDF export, import with validation, audit log, team roles,
  backups, licensing/admin console.

What it deliberately does **not** do: take payments on the owner's behalf, hold
customer money, run payroll, or connect to the NRS e-invoicing API (yet).

## 4. Competition and positioning

| Product | What it is | Price seen | Where Co-op differs |
|---|---|---|---|
| **Bumpa** | social-commerce storefront + light inventory | subscription + transaction fees | Co-op is the back office (stock ledger, VAT invoice, receivables); Bumpa is the shopfront |
| **Fisco** | storefront + inventory + bookings | free tier, **₦10,000/mo** Pro | Co-op works offline and issues a statutory VAT invoice |
| **CliqPOS / generic POS** | till + stock | **₦5,000–₦20,000/mo** | those are online-only and thin on invoicing/AI |
| **Odoo POS/Inventory** | full ERP | **$20–36/user/mo ≈ ₦27,000–₦49,000** | Odoo needs implementation help and a live connection; Co-op is self-serve and offline |
| **Zoho Retail/Books** | suite of apps | **₦25,000–₦60,000/mo** for the combination | single product, no per-app assembly |
| **Sage 50cloud** | accounting | **$51/mo ≈ ₦69,000** | aimed upmarket |

**Positioning:** *the compliance-grade back office that keeps working when the
network does not.* Three claims, each defensible from the codebase:

1. **It cannot lie about your money.** The AI is given only verified rows and
   may state nothing else; it can propose one action and cannot execute it.
2. **It works offline.** SQLite + sync queue; every competitor above is a web app.
3. **It produces a tax-ready invoice.** Sequential numbering, TIN, registration
   number, 7.5% VAT shown separately, subtotal and total.

Price is deliberately **not** the differentiator — undercutting ₦5,000 POS apps
starves an AI product. The differentiator is consequence: a wrong number costs
an SME money and a missing invoice costs them a penalty.

## 5. Pricing (Naira-native, set from observed market prices)

Current catalogue in the app was **$29 / $99 per month**. At the official rate of
about **₦1,348/USD** (Nov 2026) that is **₦39,000 / ₦133,500** — three to
twenty-five times the observed willingness to pay of a Nigerian micro business,
and above Odoo's per-user price. **A USD-priced $29 product cannot sell to a
shop that compares it with a ₦10,000 competitor.** This pass changes the
catalogue to Naira.

| Plan | Price | Annual (20% off) | AI credits/mo | Comparable |
|---|---|---|---|---|
| Free | ₦0 | — | 25 | entry, no card |
| **Starter** | **₦9,500/mo** | ₦91,200 | 200 | below Fisco Pro (₦10,000), above generic POS (₦5,000) |
| **Professional** | **₦29,000/mo** | ₦278,400 | 1,000 | below Odoo POS+Inventory (₦37,500–₦55,500) |
| Enterprise | contact | — | unlimited | multi-outlet, support SLA |

Why these numbers: they sit in the band the market has already proven
(₦5,000–₦60,000), they leave the AI affordable inside the price (200 credits on
Starter), and they leave room for a **50% founding-customer discount** that costs
nothing to give and creates urgency before the July 2027 deadline.

**Unit economics per Starter customer (measured inputs, modelled outputs):**
Paystack's published Nigerian card fee is **1.5% + ₦100** on transactions above
₦2,500, capped at ₦2,000. On ₦9,500 monthly that is **₦242.50** — 2.6% of
revenue. Hosting on a free tier is ₦0 until roughly 50–100 active businesses; the
database is Supabase's free tier at the start. So gross margin on Starter is
**≈97% before AI cost**, and the plan is profitable per customer from the first
payment as long as the AI cost per credit stays under roughly ₦47 (the ceiling
implied by ₦9,500 ÷ 200 credits). That ceiling is a **modelled** number and must
be measured against OpenRouter invoices in the first month of real usage — it is
the single most important metric to instrument.

## 6. Zero-capital operating plan

The constraint is real: no money. Everything below is free or deferred.

**0–30 days — sell before building anything else**

| Action | Cost | Why |
|---|---|---|
| 10 design-partner calls with SMEs that invoice other businesses | ₦0 | the only thing that matters: does the tax-invoice pain get someone to pay |
| Onboard 3 paying design partners at a **50% founding price** (₦4,750/mo) | ₦0 | cash + testimonials + the reference list investors ask for |
| Register the business properly (CAC) if not already | internal cost, defer until first revenue | required for TEF and for invoicing |
| Record a 3-minute demo: offline order → VAT invoice → receivable | ₦0 | this is the sales asset; no website needed |
| Publish the invoice compliance checklist (blog/WhatsApp) | ₦0 | content that pre-sells to people searching "FIRS e-invoice" |

**30–90 days — prove repeatability**

- 15 paying businesses, ≥₦100,000 MRR, <5% monthly churn.
- Instrument AI cost per business; if a Starter customer's AI cost exceeds ₦2,000/month, cut credits or raise price.
- Apply to the **Tony Elumelu Foundation** programme ($5,000 non-refundable; applications open Q1, deadline reported as 1 March 2026 — **verify the current cycle**).
- Apply to **Google for Startups Africa** ($100,000 in Google Cloud credits, equity-free) — removes hosting cost entirely.

**90–180 days — raise from strength**

- Target **Google for Startups Black Founders Fund** (up to **$100,000** non-dilutive) — needs a working product and traction, which is exactly what the 90-day plan produces.
- Pre-seed conversations only after the numbers exist. Pre-seed cheques in Africa
  are typically **$10k–$150k**; the reported benchmark is that decks opening with
  unit economics and retention do better than decks opening with market size.
  This plan opens with both, but the traction slide has to be real.

**The only unavoidable cash before public launch** (already documented in
`docs/GO_LIVE_COSTS.md`): a **Windows code-signing certificate (~$120–400/yr)**
once you ship an installer. Until then, distribute signed-by-GitHub-Actions
builds and accept the SmartScreen warning.

**Equity discipline:** grants first (no dilution), revenue second, pre-seed last.
With ₦9,500 pricing, 100 paying businesses is ₦950,000/month — enough to fund the
company without selling it.

## 7. Go-to-market (no ad budget)

1. **The accountant channel.** Bookkeepers and tax consultants serve 20–50 SMEs
   each and are about to be blamed for non-compliant invoices. One accountant
   relationship is worth more than 1,000 impressions. Offer a rev-share, not a discount.
2. **Trade associations.** Market associations, tailoring/textile guilds, pharmacy
   chains and campus-area retail clusters buy in groups and compare notes.
3. **The deadline.** Every conversation starts with "your invoices need a TIN and
   a VAT line by 2027" — a fact with a source, not a pitch.
4. **Resellers of POS hardware.** They already visit the shops; give them a
   recurring cut for installing Co-op on the desktop.
5. **Content in the language of the pain** — "how to write a FIRS-compliant
   invoice", "what happens if your invoice has no TIN".

## 8. Metrics that decide everything

| Metric | Target by month 6 | Why |
|---|---|---|
| Paying businesses | 25 | proves the pain converts |
| MRR | ₦250,000 | proves it is a business, not a project |
| Logo churn | <5%/month | the number that kills SMB SaaS |
| AI cost / paying business | <₦1,500/month | keeps Starter profitable |
| Activation: first VAT invoice issued | >60% within 7 days | the aha moment is the invoice, not the dashboard |
| Support tickets per business | <0.5/month | solo founder cannot scale support |

## 9. What this pass changed in the product to match the plan

Detailed in `docs/PRODUCT_MARKET_FIT_AUDIT.md`; summarised:

1. **Tax-ready invoice**: registration number (RC/BN) captured per business and
   printed, alongside the TIN, sequential invoice number, date of supply and the
   VAT line — closing the gap to the statutory field list.
2. **Naira pricing** in the catalogue and the payment config, replacing the
   $29/$99 figures that the market comparison in §5 rules out.
3. **Licence key shown only to the owner** (the API now enforces what the UI
   already assumed), and the meaningless hash replaced with a short reference.

## 10. Risks, honestly

| Risk | Likelihood | Mitigation |
|---|---|---|
| SME willingness to pay is lower than modelled | medium | founding-customer pricing; sell the invoice, not the dashboard |
| AI cost per credit exceeds the ceiling | medium | measure in month 1; cut credits or raise price before scaling |
| NRS e-invoicing integration is harder than expected | high | partner or defer; a compliant PDF + CSV is useful before API clearance is possible |
| Bumpa/Odoo bundle invoicing and undercut | medium | they are online-first; offline + receivables + audit trail is the moat |
| Single founder, no runway | high | grants first, revenue second, keep fixed costs at zero |
| FX: naira pricing vs USD hosting | medium | price in Naira, keep costs in Naira where possible, grants cover infra |
| Tax advice is wrong | medium | never present the app as legal advice; verify with an accountant before a slide |

## 11. What we will not do

- No lending/credit product (needs a licence and capital).
- No payment collection on behalf of the merchant (regulatory surface).
- No marketplace/storefront (that is Bumpa's game).
- No custom ERP implementation work (that is Odoo's game).
- No paid ads before 25 paying customers.

## Sources

- **SMEDAN/NBS MSME Survey** — 39.65m MSMEs, 96.9% of businesses, 87.9% of employment, 46.3–49.7% of GDP: [Fate Foundation summary (PDF)](https://fatefoundation.org/wp-content/uploads/2024/03/7.-SMEDAN-1.pdf), [Lagos Business News](https://lagosbusinessnews.ng/2022/01/13/smedan-nbs-releases-2020-msme-survey-report/)
- **Nigeria Tax Act 2025 / NRS e-invoicing phases and invoice fields**: [LeafTally compliance guide](https://leaftally.com/blogs/nrs-e-invoicing-nigeria-2026-compliance-guide/), [InvoiceQuickly — VAT invoice requirements](https://invoicequickly.com/blog/invoice-requirements-nigeria), [Baker Tilly Nigeria](https://www.bakertilly.ng/insights/nigerias-2025-tax-reform-acts-explained), [AutoBill — FIRS e-invoicing 2026](https://blog.autobillhq.com/blog/firs-e-invoicing-nigerian-freelancers/)
- **Competitor pricing**: [CliqPOS price guide 2026](https://cliqpos.com/pos-system-price-nigeria-2026), [Fisco comparison](https://www.usefisco.com/blog/best-business-management-software-for-small-businesses-in-nigeria), [Lumi POS pricing table](https://blog.lumibusiness.io/best-retail-pos-systems-in-nigeria-2026/), [SoftwareSuggest Odoo/Zoho/Sage prices](https://www.softwaresuggest.com/inventory-management-software/nigeria)
- **FX rate** ~₦1,348/USD official, Nov 2026: [Monierate CBN rates](https://monierate.com/fx/official), [ValutaFX](https://www.valutafx.com/convert/ngn-usd)
- **Bumpa funding and traction**: [TechCrunch ($4m seed, Base10)](https://techcrunch.com/2022/10/19/nigerian-retail-automation-platform-bumpa-raises-4m-led-by-base10-partners/), [Techpoint ($200k pre-seed)](https://techpoint.africa/insight/bumpa-digitise-thousands-businesses/)
- **Grants**: [TEF $5,000 programme](https://techmoonshot.com/2026/01/19/the-complete-guide-to-business-grants-for-african-entrepreneurs-in-2026-500m-in-non-dilutive-funding-available/), [Google Black Founders Fund / Google for Startups Africa](https://afrotools.com/blog/african-startup-funding-2026/), [Launch Base Africa on pre-seed ranges and unit economics](https://launchbaseafrica.com/2026/02/20/fresh-funds-african-tech-firms-can-pitch-to-in-2026/)
- **Paystack fees**: Paystack's published Nigerian pricing (1.5% + ₦100 above ₦2,500, capped at ₦2,000) — confirm on the dashboard before modelling.
