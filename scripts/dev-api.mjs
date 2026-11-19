/**
 * Start the API the way this checkout expects, on any OS.
 *
 * Why this exists: `pnpm dev` starts only the web app. The API is a separate
 * Python process, and when it isn't running every request the browser makes
 * comes back as a bare `502 Bad Gateway` — which reads like a bug in the app
 * rather than a process that was never started.
 *
 * It picks the interpreter in this order, so nobody has to remember whether
 * they are on `.venv\Scripts\python.exe` or `.venv/bin/python`:
 *
 *   1. the repo's own virtualenv (Windows or POSIX layout)
 *   2. `python3` / `python` on PATH
 *
 * Then it execs uvicorn with the same host/port the Vite proxy targets
 * (127.0.0.1:8000 — not "localhost", which resolves to ::1 on modern Windows
 * and would leave the proxy talking to a socket nothing is listening on).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const venvCandidates = [
  join(root, '.venv', 'Scripts', 'python.exe'), // Windows
  join(root, '.venv', 'bin', 'python'), // macOS / Linux
  join(root, 'venv', 'Scripts', 'python.exe'),
  join(root, 'venv', 'bin', 'python'),
];

function pickPython() {
  const found = venvCandidates.find(existsSync);
  return found ?? process.env.PYTHON ?? 'python3';
}

const python = pickPython();

if (!existsSync(join(root, 'backend', 'main.py'))) {
  console.error('[api] backend/main.py not found — run this from the repo root.');
  process.exit(1);
}

if (!existsSync(join(root, '.venv')) && python === 'python3') {
  console.warn(
    '[api] No .venv in the repo root, so the system interpreter is used.\n' +
      '[api] If that fails with "No module named fastapi", create one:\n' +
      '[api]   python -m venv .venv\n' +
      '[api]   .venv\\Scripts\\pip install -r backend\\requirements.txt   (Windows)\n' +
      '[api]   .venv/bin/pip install -r backend/requirements.txt        (macOS/Linux)'
  );
}

const args = [
  '-m',
  'uvicorn',
  'backend.main:app',
  '--reload',
  '--host',
  '127.0.0.1',
  '--port',
  '8000',
  ...process.argv.slice(2),
];

console.log(`[api] ${python} ${args.join(' ')}`);
const child = spawn(python, args, { cwd: root, stdio: 'inherit' });

child.on('error', (err) => {
  console.error(`[api] Could not start ${python}: ${err.message}`);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 0));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
