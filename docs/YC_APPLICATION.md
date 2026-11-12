# Would YC fund this? An honest read, and the application written out

Written 2026-11-23, against the product as it stands on this branch. Two parts:

1. **The verdict** — what a YC partner would actually think in the ten minutes
   they give an application.
2. **The application** — the real answers, with every number wired to
   `GET /platform/investor-metrics` so nothing here is invented.

Where a claim comes from a source it is cited; where it is my judgement as a
reader of YC's published advice, it says so.

---

## Part 1 — The verdict

### Short answer

**Today: no.** Not because the product is weak — the product is unusually strong
for a pre-traction applicant — but because YC funds evidence of momentum, and
there is none: no users, no revenue, no week-over-week curve, and no founder
story on the page yet. The application would most likely be rejected at the
written screen, before anyone ran the app.

**With ten paying design partners and a working demo, the answer changes** —
not to "likely", but to "worth the application". That is the whole plan below.

### What YC actually weighs (in their order, not mine)

| # | Criterion | What it means in practice | Where Co-op stands |
|---|---|---|---|
| 1 | **Founders** | Can they build *and* sell? Have they shipped before? Teams of two to four with history together are the sweet spot; solo founders are roughly **10–15% of a batch** and are held to a higher bar | **Unknown to a reader.** One founder, technical (the repo proves it), no prior exit or track record on the page. This is the weakest column, and it is not fixable by code |
| 2 | **Evidence of doing** | Users, revenue, growth, retention. "Five paying customers beat no mention at all." About **85% of accepted teams** have a working prototype or live product | **Product: far above the bar.** Users and revenue: **zero** |
| 3 | **Why this team, this problem** | Founder-market fit — did you live the problem? | **Missing.** Nothing in the product says why *you* and not the 500 other SMB tools |
| 4 | **Market** | Can this become a very large company? Bottoms-up, not "$50B TAM" | **Arguable.** 36.2m US small businesses, but the segment is crowded and the incumbents give a lot away free |
| 5 | **Clarity** | One plain sentence a smart non-expert can repeat | **Currently no.** "Offline-first ERP with grounded AI for dollar-market SMBs" is three ideas |

Sources: [YC application FAQ/analysis](https://ycinsight.com/questions/applying-to-yc),
[YC 2026 founder guide](https://rizevault.razorpay.com/p/y-combinator-prep-faq-bank-2026-guide),
[solo-founder data](https://zyner.io/blog/yc-solo-founders),
[batch composition](https://getpancake.ai/blog/yc-w26-solo-founders).

### The four questions a partner would ask, and the honest answer today

**1. "Who is using it?"**
Nobody. That is the end of the interview. YC's own advice treats a working
product with ten paying users as stronger than a forty-page deck; Co-op has the
product and none of the users. *(Judgement, based on the sources above.)*

**2. "What can you do that QuickBooks, Xero, Wave and Zoho cannot?"**
The defensible answers, in order of strength:

- **It runs without internet, as a desktop app with a local ledger that syncs.**
  Every named competitor is a browser app. This is real and demonstrated in the
  code, but it is a feature, not a moat — a competitor could ship it in a year.
- **The AI is grounded and cannot invent a number.** It answers only from
  verified rows, proposes at most one action, and cannot execute it. Genuinely
  better than most "AI features" shipped by SMB tools. Still a feature.
- **Flat per-business pricing against per-seat pricing.** $29 or $99, versus
  FreshBooks' +$11/seat and QuickBooks' multi-user starting at $85/mo. Real,
  but price is not a moat either — Wave is free.

None of these is a *why now*. That is the structural problem: the Nigerian plan
had a statutory deadline dragging businesses to new software. The USD market has
no such forcing function, and the plan says so.

**3. "Isn't this a crowded space?"**
Yes. YC lists "crowded space with no clear wedge" as a top rejection reason.
The counter is not "our AI is better" — it is a specific customer with a specific
pain that the incumbents structurally will not serve (see "the wedge we can
actually defend" below).

**4. "Why should we believe you can sell?"**
Today, there is nothing to believe yet. This is the solitary-founder penalty in
one sentence: the reader has to assume you can do the half of the job the repo
does not demonstrate.

### What is genuinely impressive (say it in the application)

Do not undersell this, because it is rare at the application stage:

- **471 backend tests, 26 frontend tests, all green** — most pre-seed applicants
  cannot say what their code does.
- **A real security posture**: tenant isolation proven by test, an append-only
  audit trail, owner-only licence routes, webhook signature verification, and a
  published audit that lists what is *not* fixed.
- **A grounded AI with a written contract**: answers come from verified context
  or not at all; the model cannot mutate data.
- **Offline desktop with a sync queue** — a genuinely harder engineering problem
  than a CRUD web app, and it is done.

This is the profile of a founder who ships. It is not, by itself, a fundable
company — but it is the right raw material.

### Probability, labelled as judgement

My estimate, not a fact: **under 5% at the written screen today**, rising to
**~10–20% with 10 paying customers and 8 weeks of retention data**, conditional
on the founder story being real and the demo being excellent. YC's overall
acceptance is ~1–2%; a strong repeat applicant with traction is in a different
pool from the median application.

### What would change the answer (and cannot be faked)

1. **Ten paying customers**, even at $14.50/mo. Revenue is the only number that
   ends the argument.
2. **Eight weeks of retention.** A weekly cohort that does not churn is the
   second number.
3. **One distribution channel that works without the founder.** Bookkeepers are
   the obvious candidate: one bookkeeper brings 10–50 businesses.
4. **A demo that runs in three minutes, offline.** `scripts/seed_demo.py` exists
   for exactly this.
5. **A founder story with a scar in it** — the specific business you watched
   lose money to a spreadsheet that could not invoice.

### The honest alternative

YC is a lottery ticket with a real cost: a Delaware C-Corp flip, three months in
San Francisco, and an application cycle. At zero revenue, the **higher expected
value is the free money that does not require traction**: Google for Startups
credits, the Black Founders Fund, and a paid pilot with three design partners.
Apply to YC anyway — it forces clarity, and reapplying with progress is normal —
but do not spend the quarter on the application instead of on customers.

---

## Part 2 — The application, written out

Answer these in plain sentences. No adjectives. The numbers come from
**Admin console → Fundraising → Copy** (`GET /platform/investor-metrics`), so the
form and the dashboard can never disagree.

### Company name

Co-op

### Company URL

*Fill in when the marketing site is deployed.*

### Describe what your company does in 50 characters or less

> Offline business software that cannot invent a number.

### What is your company going to make?

> Co-op is a desktop business system for small wholesalers and retailers —
> inventory, customers, orders, invoices, receivables, and an AI assistant — that
> keeps working when the internet does not. It runs on a local database and syncs
> when a connection appears. The assistant answers only from the business's own
> verified records, proposes at most one action, and cannot change data.

### Which category?

B2B → SaaS / enterprise software.

### What is the problem?

> Small businesses that hold stock and invoice other businesses run on three
> tools that do not talk to each other: a spreadsheet for stock, an invoice
> template in Word, and a memory for who owes what. Every competitor that could
> replace them is a web app — so the work stops when the connection does, which
> for a shop with a flaky line means the till cannot answer a customer.
> *(This must be backed by ten customer conversations, not asserted. Record the
> calls; quote two of them verbatim.)*

### How do you know people need this?

> **This is the weakest field today.** The honest answer until design partners
> exist is the number of people who said "yes, send me the download" and the
> number who paid. Do not fill this with adjective-driven market sizing; a reader
> can tell.

### How many users / customers do you have? How much revenue?

> Pull the exact sentence from the Fundraising tab. It reads, for example:
> "3 businesses signed up; 1 in the last 7 days; 1 paying, $29.00 MRR; 50%
> activated (first invoice)."
>
> If there are no paying customers, say so in one line and move immediately to
> activation and retention of free users — a reader will forgive zero revenue
> sooner than they will forgive vagueness.

### Why now?

> Be honest. There is no deadline in this market. The honest why-now is
> distribution and cost: a desktop app now ships through GitHub Actions for $0,
> an AI that is grounded in a database is finally cheap enough to run inside a
> $29 subscription, and the small-business tools that dominate are pulling prices
> up (QuickBooks raised every tier 15–25% in May 2026) while giving the cheap tier
> fewer users. *Cite the price rises; do not claim a regulatory wave that does not
> exist.*

### Who are your competitors, and what do you understand that they do not?

> Wave (free), Zoho Books ($15–20/mo), FreshBooks ($23–70 + $11/seat), QuickBooks
> Online ($38–340), Xero ($25–90), plus pen-and-paper and Excel for most of the
> market. All of them are browser apps priced per seat; none of them works on a
> dead connection; none of them can prove an AI answer came from the business's
> own rows.

### What is your business model?

> Subscription, billed in USD: Free ($0), Starter ($29/mo, 200 AI credits),
> Professional ($99/mo, 1,000 credits), Enterprise (custom). Annual is 20% off.
> Nothing is charged per seat. Payment rail: Paystack USD at 3.9% while the
> entity is Nigerian; Stripe (2.9% + $0.30) once a US entity is justified.

### How will you make money in five years?

> *(Leave this honest and specific to the wedge you can defend — see below.)*

### Why are you the right person to build this?

> **Unwritten, and only you can write it.** A reader can see from the repository
> that you ship; they cannot see why you care. One paragraph with a real incident
> in it — a business you watched get the invoice wrong — is worth more than a CV.

### The wedge we can actually defend

The strongest version of this company is not "ERP for everyone". It is:

> **A wholesaler who sells to other businesses, holds stock, invoices on terms,
> and cannot afford for the system to be down or wrong.**

That customer has a specific, checkable pain (receivables and stock confidence),
a reason to pay ($29 is less than an hour of bookkeeping), and a reason to
tolerate a new vendor (the incumbents are online-only and priced per seat). Lead
with that business, not with "small businesses" generally.

---

## What this pass built to support the application

| Artefact | Why it exists |
|---|---|
| `GET /platform/investor-metrics` + Admin → **Fundraising** tab | The five numbers an application asks for, computed from the ledgers, with the definition of each one printed next to it and a one-click copy of a quotable headline |
| `scripts/seed_demo.py` (`backend/demo.py`) | A believable eleven-week trading history in one command, so a three-minute demo — and the screen recording YC asks for — can be made without waiting for a real customer |
| `backend/tests/test_investor_metrics.py` | The metrics are arithmetic, so they are tested: growth with no base is "no data", failed charges are not revenue, annual is normalised to monthly, and the demo seed reconciles its stock ledger |

## Sources

- What YC looks for, acceptance rate, solo-founders share, traction weight:
  [Applying to YC — every question answered](https://ycinsight.com/questions/applying-to-yc),
  [YC 2026 founder insights](https://rizevault.razorpay.com/p/y-combinator-prep-faq-bank-2026-guide),
  [Does YC accept solo founders (2026)](https://zyner.io/blog/yc-solo-founders),
  [W26 solo-founder share](https://getpancake.ai/blog/yc-w26-solo-founders),
  [how to get in](https://www.stackmatix.com/blog/how-to-get-into-y-combinator)
- YC standard deal ($500k: $125k for 7% + $375k MFN), US incorporation
  requirement: [Roundfunded (Nov 2026)](https://www.roundfunded.com/en/blogs/yc-standard-deal-equity-explained-2026)
- Market size and competitor prices: see `docs/BUSINESS_PLAN.md` §2 and §4.
