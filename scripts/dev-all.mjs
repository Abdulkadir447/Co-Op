/**
 * Run the whole thing — API and web app — with one command.
 *
 * `pnpm dev` alone starts the frontend, and every /api request it makes then
 * fails with a bare 502 because nothing is listening on the other side. This
 * starts both so that failure cannot happen, and prefixes each process's
 * output so it is obvious which one is talking.
 *
 * Ctrl-C stops both.
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';

function prefixed(name, color, child) {
  const write = (stream, chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line.trim()) stream.write(`${color}[${name}]\x1b[0m ${line}\n`);
    }
  };
  child.stdout.on('data', (c) => write(process.stdout, c));
  child.stderr.on('data', (c) => write(process.stderr, c));
  return child;
}

// The API is started through its own script so the interpreter choice lives in
// exactly one place (scripts/dev-api.mjs).
const api = prefixed(
  'api',
  '\x1b[36m',
  spawn(process.execPath, [resolve(root, 'scripts', 'dev-api.mjs')], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
);

const web = prefixed(
  'web',
  '\x1b[35m',
  spawn('pnpm', ['--filter', './frontend', 'dev'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWindows, // pnpm is a .cmd on Windows
  })
);

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of [api, web]) {
    if (!child.killed) child.kill(isWindows ? undefined : 'SIGTERM');
  }
  process.exit(code);
}

api.on('exit', (code) => {
  if (!shuttingDown) {
    console.error(`\n[dev] The API exited (code ${code}). The web app alone will answer 502 for every /api call.`);
    shutdown(code ?? 1);
  }
});
web.on('exit', (code) => {
  if (!shuttingDown) shutdown(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => shutdown(0));
