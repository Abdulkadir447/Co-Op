/**
 * `pnpm doctor` — answer the questions a failing first run always raises.
 *
 * Written after three rounds of the same two endpoints returning 500 with
 * nothing but "Internal Server Error" in the browser. The decisive question
 * each time was "is the API I am talking to running the code I just pulled?" —
 * a stale `uvicorn` process and an unfixed bug look identical from a browser.
 *
 * Checks, in the order they fail:
 *   1. Node / pnpm versions
 *   2. The checkout's commit
 *   3. The Python side: interpreter, tz database, DATABASE_URL, imports
 *   4. Is the API answering? On which commit? Does it think it has time zones?
 *   5. Is the web app answering?
 *
 * Exit code 1 when something is definitely wrong, so CI or a script can use it.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = process.env.DOCTOR_API_URL ?? 'http://127.0.0.1:8000';
const WEB = process.env.DOCTOR_WEB_URL ?? 'http://127.0.0.1:3000';

const problems = [];
const notes = [];

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function ok(label, value) {
  console.log(`  ${green('ok')}    ${label}${value ? dim(`  ${value}`) : ''}`);
}
function bad(label, value, fix) {
  console.log(`  ${red('FAIL')}  ${label}${value ? `  ${value}` : ''}`);
  problems.push(fix ? `${label} — ${fix}` : label);
}
function warn(label, value, fix) {
  console.log(`  ${yellow('warn')}  ${label}${value ? `  ${value}` : ''}`);
  if (fix) notes.push(`${label} — ${fix}`);
}

function pythonPath() {
  const candidates = [
    join(root, '.venv', 'Scripts', 'python.exe'),
    join(root, '.venv', 'bin', 'python'),
    join(root, 'venv', 'Scripts', 'python.exe'),
    join(root, 'venv', 'bin', 'python'),
  ];
  return candidates.find(existsSync) ?? process.env.PYTHON ?? 'python3';
}

function sh(cmd, args) {
  try {
    return execFileSync(cmd, args, { cwd: root, encoding: 'utf8', timeout: 30000 }).trim();
  } catch {
    return null;
  }
}

console.log('\nCo-op doctor\n');

// --- 1. Toolchain -----------------------------------------------------------
console.log('Toolchain');
ok('node', process.version);
const pnpmVersion = sh('pnpm', ['--version']);
pnpmVersion ? ok('pnpm', pnpmVersion) : bad('pnpm', 'not on PATH', 'npm i -g pnpm@9.15.9');
existsSync(join(root, 'node_modules'))
  ? ok('node_modules', 'installed')
  : bad('node_modules', 'missing', 'run `pnpm install` from the repo root');

// --- 2. Checkout ------------------------------------------------------------
console.log('\nCheckout');
const head = sh('git', ['rev-parse', '--short', 'HEAD']);
head ? ok('commit', head) : warn('commit', 'not a git checkout or git missing');
const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch && branch !== 'HEAD') ok('branch', branch);

// --- 3. Python side ---------------------------------------------------------
console.log('\nPython');
const python = pythonPath();
const reportRaw = (() => {
  try {
    return execFileSync(python, [join(root, 'scripts', 'environment_report.py')], {
      cwd: root,
      encoding: 'utf8',
      timeout: 60000,
    }).trim();
  } catch (err) {
    const detail = (err.stderr || err.message || '').split('\n').filter(Boolean).slice(-3).join('\n         ');
    console.log(`  ${red('FAIL')}  python report  ${detail}`);
    problems.push(
      python +
        ' could not import the backend — create the virtualenv and install ' +
        'backend/requirements.txt (docs/RUN_LOCAL.md §1)'
    );
    return null;
  }
})();

let report = null;
if (reportRaw) {
  try {
    report = JSON.parse(reportRaw.split('\n').filter((l) => l.trim().startsWith('{')).pop());
  } catch {
    warn('python report', 'unparseable');
  }
}

if (report) {
  ok('interpreter', `${report.python}  ${report.python_executable}`);
  report.imports_ok ? ok('backend imports') : bad('backend imports', report.import_error);

  if (report.tz_database === true) {
    ok('time zone database');
  } else if (report.tz_database === false) {
    bad(
      'time zone database',
      'missing — business-local reports will fall back to UTC',
      `install it: ${python} -m pip install tzdata   (required on Windows)`
    );
  } else {
    warn('time zone database', report.tz_error ?? 'could not be checked');
  }
  if (report.tz_database === false && report.tzdata_package === false) {
    notes.push('the tzdata package is not installed in this interpreter');
  }

  if (report.database_url_valid) {
    ok('DATABASE_URL', `${report.database_scheme} → ${report.database_target}  (COOP_ENV=${report.env})`);
  } else {
    bad('DATABASE_URL', report.database_url_error);
  }
}

// --- 4. The API -------------------------------------------------------------
console.log('\nAPI');

async function get(url, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 120);
    }
    return { status: res.status, body };
  } catch (err) {
    return { status: 0, error: err.name === 'AbortError' ? 'timed out' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

const health = await get(`${API}/healthcheck`);
if (health.status === 0) {
  bad('not answering', `${API} — ${health.error}`, 'start it with `pnpm dev:api` (or `pnpm dev:all`)');
} else {
  ok('answering', API);
  if (health.status === 200) ok('healthcheck', 'healthy');
  else bad('healthcheck', JSON.stringify(health.body));
}

const version = await get(`${API}/version`);
if (version.status === 200 && version.body && typeof version.body === 'object') {
  const running = version.body.commit;
  ok('running commit', `${running}   started ${version.body.started_at}`);
  if (head && running && running !== 'unknown' && !head.startsWith(running) && !running.startsWith(head)) {
    bad(
      'stale API process',
      `checkout is ${head}, the running API is ${running}`,
      'restart it: the code on disk is newer than the code in memory'
    );
  }
  if (version.body.tz_database === false) {
    notes.push('the running API has no time zone database — restart it after installing tzdata');
  }
  if (version.body.env === 'production') {
    notes.push('the API thinks it is in production (COOP_ENV=production)');
  }
} else if (version.status === 404) {
  warn(
    'no /version endpoint',
    'the running API predates it, so its commit cannot be checked',
    'restart the API to pick up the current code'
  );
}

// --- 5. The web app ---------------------------------------------------------
console.log('\nWeb app');
const web = await get(WEB);
if (web.status === 0) {
  bad('not answering', `${WEB} — ${web.error}`, 'start it with `pnpm dev` (or `pnpm dev:all`)');
} else {
  ok('answering', WEB);
}

// --- Summary ----------------------------------------------------------------
console.log('');
if (problems.length === 0) {
  console.log(green('Everything checks out.') + (notes.length ? '' : ''));
} else {
  console.log(red(`${problems.length} problem(s):`));
  for (const p of problems) console.log(`  · ${p}`);
}
if (notes.length) {
  console.log('\n' + yellow('Worth knowing:'));
  for (const n of notes) console.log(`  · ${n}`);
}
console.log('');

process.exit(problems.length === 0 ? 0 : 1);
