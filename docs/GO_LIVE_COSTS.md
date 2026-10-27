# Go-live costs — what is free, what is paid, and what actually blocks a sale

Written to end a recurring confusion: **most of the "remaining launch work" is
free, but a few security items are not**, and they are easy to mistake for
each other. Every price below is a list price as published by the vendor,
checked 2026-10-24; the vendor's own page is the final word.

> **Correction to earlier advice in this repo's history:** Clerk's free (Hobby)
> plan does **not** include MFA or a custom session lifetime. Both are Pro
> features ($25/mo). An earlier note in this file's history claimed Clerk's
> production configuration was free — that was wrong for those two items.

## The short version

| | Cost | Blocks a **pilot** (3–5 customers)? | Blocks a **public launch**? |
|---|---|---|---|
| Clerk Hobby (auth) | $0 | No | No |
| Clerk Pro (MFA + custom sessions) | $25/mo | No | **Yes — for MFA** |
| Supabase (Postgres) | $0 free tier | No | Not until you outgrow it |
| API host (Render/Fly) | $0–7/mo | No | No |
| Domain | ~$10–15/yr | No | No |
| Sentry (error monitoring) | $0 free tier | No | No |
| **Windows code-signing certificate** | **~$120–400/yr** | No (warn customers) | **Yes** |
| **Apple Developer (macOS only)** | **$99/yr** | No | Only if shipping to macOS |
| Paystack | 1.5% + ₦100 (capped ₦2,000) | No | No (you only pay when you earn) |

**The only unavoidable cash before a public launch: one Windows
code-signing certificate.** Everything else is either free or can wait until
revenue exists.

## Clerk — the detail that matters

| Feature | Hobby ($0) | Pro ($25/mo) |
|---|---|---|
| Monthly retained users | 50,000 / app | 50,000 / app, then $0.02 |
| Custom domain (production instance) | ✅ included | ✅ |
| Email/password + social login + prebuilt UI | ✅ | ✅ |
| Device tracking / session revocation | ✅ | ✅ |
| Application logs | 1 day | 7 days |
| **MFA (TOTP / SMS)** | ❌ | ✅ |
| **Custom session lifetime** | ❌ **fixed 7 days** | ✅ 5 min – 10 years |
| Passkeys (production) | ❌ | ✅ |
| Remove "Secured by Clerk" branding | ❌ | ✅ |

What this means for Co-op specifically:

1. **You can run a production Clerk instance on the free plan** — a custom
   domain is included, so `CLERK_FRONTEND_API` can point at a real host. Auth
   works; it simply has no MFA and a fixed 7-day session.
2. **The 7-day session is the offline problem.** Every user is forced to
   re-authenticate weekly, and Clerk is a hosted service — so re-auth needs
   internet. A shop offline for longer than its session window cannot sign in,
   even with a complete local database. On free this is not configurable.
   **Clerk Pro ($25/mo) is therefore the cheapest fix for the offline-auth
   gap**: set the session lifetime to e.g. 90 days and month-long outages stop
   being a lockout.
3. MFA can wait for the pilot (password + Clerk's built-in protections are
   reasonable for 3–5 known customers), but it is a genuine blocker before
   selling to strangers with real books in the app.

### If $25/mo is ever the blocker

Supabase Auth (already part of this stack, free tier) includes TOTP MFA and a
configurable JWT expiry at $0. Migrating to it is **weeks of work, not days**:
`backend/clerk_auth.py` gates 75 routes, the frontend is built on
`@clerk/react`, and the test suite mocks the Clerk dependency. Do not do this
to save $25/mo. It is written down only so the option is known.

## What is genuinely free and should be done this week

These cost nothing and take about an hour in total:

1. **Click through the free Clerk settings** — password policy (minimum
   length, breach detection), session inactivity timeout, allowed origins,
   email verification requirement, bot/brute-force protection. All available
   on Hobby.
2. **Create a Clerk production instance** on your own domain (free) so
   `CLERK_FRONTEND_API` is not the dev instance.
3. **Sentry free tier** for the backend + desktop crash reporting.
   `SECURITY_AUDIT.md` notes there is no alerting at all today — a free plan
   fixes the "nobody knows it broke" problem.
4. **Register the domain** (~$10–15/yr) — the only near-free item that is not
   strictly $0, and it is needed for both Clerk production and HTTPS on the
   API.

## Sequence that matches your cash position

**Now (free):** pilot with 3–5 design partners on Clerk Hobby. Tell each one
they will be asked to sign in again every 7 days. Keep the app online-first
for them.

**First revenue ($25/mo):** Clerk Pro. This buys MFA *and* long sessions in
one move — MFA for the security checklist, long sessions to make the offline
promise real. It is the highest-value $25 you will spend, because it replaces
work that would otherwise be weeks of custom offline-auth engineering.

**First $400-ish of profit:** Windows code-signing certificate (~$120–400/yr).
Before this, every download shows "Unknown publisher" and a share of customers
will stop there. Ship to design partners with an explanation; do not let a
stranger meet that warning alone.

**Only if you ship to macOS:** Apple Developer ($99/yr) + notarization. A
Windows-first launch is entirely defensible for this market.

**Later, as usage grows:** Supabase paid tier (when the free database is too
small / needs backups), Render paid instance (no cold starts), Clerk MRU
overage above 50,000 users. None of these are on the critical path to the
first customer.

## Related

- `docs/RELEASE.md` — signing variables and the release checklist.
- `docs/LAUNCH_READINESS.md` — the code-side blocking list.
- `docs/SECURITY_CHECKLIST_STATUS.md` — which checklist items are
  dashboard/operator settings rather than code.
