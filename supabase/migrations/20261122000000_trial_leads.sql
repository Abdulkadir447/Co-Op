-- Trial leads: the people who asked for the trial before they had the app.
--
-- WHY THIS TABLE EXISTS
-- ---------------------
-- The site's primary CTA used to send a stranger straight to a GitHub releases
-- page. That works for developers and fails for a shop owner in Kano, and — the
-- expensive part — it left no record of who wanted a trial. No list to email
-- when a version ships, no way to tell which channel produced a trial, no way
-- to see how many people start a download and never come back.
--
-- The /trial form writes one row here BEFORE handing over the installer. The
-- row is the only thing that makes the funnel measurable: arrival → form →
-- download → activation.
--
-- WRITE PATH
-- ----------
-- Inserted by the site itself, with the project's **publishable** (anon) key,
-- because there is no Clerk session on the marketing site. That means RLS must
-- allow anonymous INSERT and nothing else:
--
--   anon          INSERT only. No SELECT: one visitor must never be able to
--                 read another's email or phone number.
--   authenticated no access; this is a public form, not business data.
--   service_role  full access, used by the backend and by you in SQL.
--
-- There is no UPDATE or DELETE policy, so a row cannot be changed or removed
-- with the anon key even if someone finds it.
--
-- The table is deliberately NOT linked to the businesses table. A lead is an
-- expression of interest from someone who has not installed anything yet; the
-- link is made at activation, by matching email, and is a backend job.

create table if not exists public.trial_leads (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),

  -- Who they are. All four are required by the form: a lead with no reachable
  -- contact is not a lead.
  name           text not null check (char_length(name) between 1 and 120),
  shop_name      text not null check (char_length(shop_name) between 1 and 160),
  email          text not null check (char_length(email) between 3 and 254 and position('@' in email) > 1),
  whatsapp       text not null check (char_length(whatsapp) between 7 and 24),

  -- Where they came from. `source` is the on-site surface ('hero', 'pricing'
  -- table, 'cta band'); `utm_*` is whatever brought them to the site. Both are
  -- nullable because a direct visitor has no campaign.
  source         text,
  utm_source     text,
  utm_medium     text,
  utm_campaign   text,
  referrer       text,
  landing_path   text,

  -- Trial funnel state. Timestamps, not booleans: "downloaded" is far less
  -- useful than "downloaded, and how long after signing up".
  installer_sent_at   timestamptz,
  first_seen_at       timestamptz,
  activated_at        timestamptz,
  unsubscribed_at     timestamptz,
  notes               text
);

comment on table public.trial_leads is
  'Expression of interest from the /trial form. Not a business account; see backend/billing.py.';
comment on column public.trial_leads.whatsapp is
  'As typed by the visitor, including country code and spacing. Normalise on read, never on write.';

-- One lead per address. A shop owner who fills the form twice is one lead, and
-- a duplicate insert from a double-tap must not create a second row. `on
-- conflict do nothing` in the site's insert relies on this index.
create unique index if not exists trial_leads_email_key on public.trial_leads (lower(email));

-- The two queries you will actually run: "who signed up recently" and "which
-- channel produced them".
create index if not exists trial_leads_created_at_idx on public.trial_leads (created_at desc);
create index if not exists trial_leads_utm_source_idx on public.trial_leads (utm_source) where utm_source is not null;

alter table public.trial_leads enable row level security;

-- Anonymous visitors may create a lead and nothing else.
drop policy if exists trial_leads_anon_insert on public.trial_leads;
create policy trial_leads_anon_insert
  on public.trial_leads
  for insert
  to anon
  with check (true);

-- Schema usage: Supabase usually grants this already, but a table anon may
-- write to is useless if it cannot reach the schema. Idempotent, and it does
-- not widen anything — the wall is the table grant below.
do $$
begin
  if not has_schema_privilege('anon', 'public', 'USAGE') then
    grant usage on schema public to anon;
  end if;
end $$;

-- Explicit denial of reads for anon. RLS already denies by default when no
-- SELECT policy exists; this is here so the intent is in the file and a future
-- `grant` cannot quietly open it up.
revoke all on public.trial_leads from anon;
grant insert on public.trial_leads to anon;

-- Verified on the live project 2026-11-22:
--   has_table_privilege('anon', 'public.trial_leads', 'INSERT')  -> true
--   has_table_privilege('anon', 'public.trial_leads', 'SELECT')  -> false
--   insert as role anon                                          -> succeeds
--   select as role anon                                          -> 42501, by grant
--
-- THE TWO TRAPS, both found by testing the real paths:
--
--   1. `insert ... returning` FAILS as anon (42501). RETURNING reads the row
--      back, and that needs SELECT. So the site sends `Prefer: return=minimal`.
--      If someone later adds `.select()` in src/trial.ts to show a confirmation
--      message, the form breaks — which is why the UI's success state does not
--      depend on the response body.
--
--   2. `resolution=merge-duplicates` ALSO FAILS. PostgREST turns it into
--      ON CONFLICT DO UPDATE, which needs UPDATE — so a visitor who submits
--      twice is told the save failed when the first one worked. The site sends
--      `resolution=ignore-duplicates` (ON CONFLICT DO NOTHING), which needs only
--      INSERT. Verified: a duplicate insert is a silent no-op, one row remains.

-- `authenticated` is granted INSERT/SELECT/UPDATE by Supabase's default
-- privileges on new tables even though this table is not for app users. It is
-- harmless here (there is no public SELECT policy, so RLS returns zero rows),
-- but pin it down explicitly: no policy is ever written for that role.
drop policy if exists trial_leads_authenticated_none on public.trial_leads;
create policy trial_leads_authenticated_none
  on public.trial_leads
  for all
  to authenticated
  using (false)
  with check (false);

-- The service role (backend, SQL editor, exports) keeps full access.
grant all on public.trial_leads to service_role;
