-- Supabase Storage bucket for Co-op.
--
-- SUPABASE-SPECIFIC: the `storage` schema exists only on a Supabase project.
-- This file will fail on a plain Postgres, which is expected — the local
-- database in RUN_LOCAL.md has no Storage service and Co-op degrades to a 503
-- on POST /business/logo instead (see backend/storage.py:is_configured).
--
-- Run it in the Supabase SQL editor, or via `supabase db push`. It is
-- idempotent.
--
-- The bucket is PUBLIC because the only thing in it is a business logo, which
-- is meant to be rendered by an <img> tag with no session attached. Anything
-- that must stay private needs its own private bucket plus
-- backend.storage.signed_url(); do not make that bucket public.
--
-- Writes never go through RLS: the API uploads with the service-role key,
-- which bypasses policies. That key must stay server-side.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'coop-assets',
  'coop-assets',
  true,
  5242880,  -- 5 MB, matching backend/storage.py MAX_BYTES
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
