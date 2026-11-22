/**
 * The lead-capture client, exercised against a fake `fetch`.
 *
 * This file exists because two "obvious" choices are wrong against the live
 * database, and both fail in a way that is invisible in review:
 *
 *   1. `return=representation` — reading the row back needs SELECT, and the
 *      site's role has INSERT only. It turns a working form into a 42501.
 *   2. `resolution=merge-duplicates` — PostgREST compiles that to
 *      `ON CONFLICT DO UPDATE`, which needs UPDATE. A visitor who submits
 *      twice is told it failed when their first submission worked.
 *
 * Neither shows up in a type check or a rendered page; both show up here.
 *
 * The module is TypeScript, so it is bundled with the esbuild that Vite already
 * depends on rather than adding a test runner or a loader.
 */
import test from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..');
const require = createRequire(join(SITE, 'package.json'));

// ── Build the module once, with `import.meta.env` stubbed the way Vite does.
//    `define` is the documented way to do this; a plugin that rewrites
//    import.meta would break the ESM output we are about to import.
const env = JSON.stringify({
  VITE_SUPABASE_URL: 'https://probe.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_probe',
});
const outfile = join(mkdtempSync(join(tmpdir(), 'coop-trial-')), 'trial.mjs');
await require('esbuild').build({
  entryPoints: [join(SITE, 'src/trial.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile,
  define: { 'import.meta.env': env },
  logLevel: 'silent',
});

const trial = await import(pathToFileURL(outfile).href);

/** A fetch double that records the call and answers with one status. */
function stubFetch(status = 201, { throws = false } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (throws) throw new TypeError('Failed to fetch');
    return { ok: status >= 200 && status < 300, status };
  };
  return calls;
}

const LEAD = {
  name: '  Amaka Obi ',
  shopName: 'Amaka Stores',
  email: ' amaka@example.com ',
  whatsapp: '0803 123 4567',
  source: 'hero',
};

// ── The insert contract ─────────────────────────────────────────────────────

test('the request is an insert the site role is actually allowed to make', async () => {
  const calls = stubFetch(201);
  const result = await trial.saveTrialLead(LEAD);
  assert.deepEqual(result, { ok: true });
  assert.equal(calls.length, 1);

  const [{ url, init }] = calls;
  assert.equal(url, 'https://probe.supabase.co/rest/v1/trial_leads');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.apikey, 'sb_publishable_probe');
  assert.equal(init.headers.Authorization, 'Bearer sb_publishable_probe');
  assert.equal(init.headers['Content-Type'], 'application/json');
});

test('the Prefer header asks for no row back and no update on conflict', async () => {
  const calls = stubFetch(201);
  await trial.saveTrialLead(LEAD);
  const prefer = calls[0].init.headers.Prefer;

  // `return=representation` needs SELECT; the anon role has INSERT only.
  assert.match(prefer, /return=minimal/);
  assert.doesNotMatch(prefer, /return=representation/);
  // `merge-duplicates` compiles to ON CONFLICT DO UPDATE and needs UPDATE.
  assert.match(prefer, /resolution=ignore-duplicates/);
  assert.doesNotMatch(prefer, /merge-duplicates/);
});

test('the body carries the four fields the /trial form asks for', async () => {
  const calls = stubFetch(201);
  await trial.saveTrialLead(LEAD);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.name, 'Amaka Obi'); // trimmed
  assert.equal(body.shop_name, 'Amaka Stores');
  assert.equal(body.email, 'amaka@example.com');
  assert.equal(body.whatsapp, '+2348031234567');
  assert.equal(body.source, 'hero');
});

test('campaign attribution is attached when the visit was tagged', async () => {
  const calls = stubFetch(201);
  globalThis.window = {
    location: {
      search: '?utm_source=twitter&utm_medium=social&utm_campaign=launch',
      pathname: '/pricing',
      origin: 'https://co-op.test',
    },
    referrer: 'https://twitter.com/someone',
  };
  globalThis.document = { referrer: 'https://twitter.com/someone' };
  await trial.saveTrialLead(LEAD);
  delete globalThis.window;
  delete globalThis.document;
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.utm_source, 'twitter');
  assert.equal(body.utm_medium, 'social');
  assert.equal(body.utm_campaign, 'launch');
  assert.equal(body.landing_path, '/pricing');
  assert.equal(body.referrer, 'https://twitter.com/someone');
});

// ── Failure must never cost the visitor their installer ─────────────────────

test('a rejected insert reports failure instead of pretending', async () => {
  stubFetch(42501);
  const result = await trial.saveTrialLead(LEAD);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'rejected');
});

test('a duplicate is success for the visitor, not an error', async () => {
  stubFetch(409);
  assert.deepEqual(await trial.saveTrialLead(LEAD), { ok: true });
});

test('a network failure is caught, never thrown into the page', async () => {
  stubFetch(0, { throws: true });
  const result = await trial.saveTrialLead(LEAD);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'network');
});

// ── Validation the form leans on ────────────────────────────────────────────

test('WhatsApp numbers are normalised to +234', () => {
  assert.equal(trial.normaliseWhatsApp('0803 123 4567'), '+2348031234567');
  assert.equal(trial.normaliseWhatsApp('08031234567'), '+2348031234567');
  assert.equal(trial.normaliseWhatsApp('+234 803 123 4567'), '+2348031234567');
  assert.equal(trial.normaliseWhatsApp('2348031234567'), '+2348031234567');
});

test('a Nigerian mobile is 10 digits after +234, starting 07/08/09', () => {
  assert.equal(trial.looksLikeNigerianMobile('0803 123 4567'), true);
  assert.equal(trial.looksLikeNigerianMobile('+2348031234567'), true);
  assert.equal(trial.looksLikeNigerianMobile('0906 000 0000'), true);
  // Truncated, non-mobile and empty input are caught.
  assert.equal(trial.looksLikeNigerianMobile('0803 123 456'), false);
  assert.equal(trial.looksLikeNigerianMobile('12345'), false);
  assert.equal(trial.looksLikeNigerianMobile(''), false);
});

test('email validation catches a typo without rejecting valid addresses', () => {
  assert.equal(trial.looksLikeEmail('amaka@example.com'), true);
  assert.equal(trial.looksLikeEmail(' amaka@example.com '), true);
  assert.equal(trial.looksLikeEmail('amaka@example'), false);
  assert.equal(trial.looksLikeEmail('amaka.example.com'), false);
  assert.equal(trial.looksLikeEmail('am aka@example.com'), false);
  assert.equal(trial.looksLikeEmail(''), false);
});

// ── The submit path must report what actually failed ────────────────────────

test('the invalid-field list is read from validate, not from stale state', () => {
  // `validate()` used to return a boolean while the caller read `errors` —
  // which `setErrors` had not applied yet, because state updates are async. The
  // analytics event therefore always carried an empty field list, so the one
  // number that says why people abandon the form was blank.
  const page = readFileSync(join(SITE, 'src/pages/Trial.tsx'), 'utf8');
  assert.match(page, /const validate = \(\): string\[\]/, 'validate must return the failing fields');
  assert.match(page, /const invalid = validate\(\)/);
  // Strip comments first: the doc comment above validate() explains the old
  // bug by name, and matching prose is not evidence of the bug.
  const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(
    code,
    /Object\.keys\(errors\)/,
    'reading `errors` straight after setErrors gives the previous render',
  );
  assert.match(page, /invalid\.join\(','\)/, 'the event must carry the field names');
});

test('a rejected form moves focus to the first bad field', () => {
  const page = readFileSync(join(SITE, 'src/pages/Trial.tsx'), 'utf8');
  // An error message below the fold is not feedback. This also matters for
  // screen readers, which announce the field that receives focus.
  assert.match(page, /\.focus\(\)/);
  assert.match(page, /input\[name="\$\{invalid\[0\]\}"\]/);
});
