#!/usr/bin/env node
'use strict';
/**
 * Release entry point — publishes installers to GitHub Releases.
 *
 * Why this exists instead of a plain `electron-builder --publish always`:
 *
 *   The app's *source* repository may be private, but GitHub requires auth to
 *   download release assets from a private repo — so an updater pointed at it
 *   would silently never update. The supported shape is therefore:
 *
 *     private source  ->  public releases-only repo  ->  electron-updater
 *
 * This script lets that target be chosen per release (COOP_RELEASE_OWNER /
 * COOP_RELEASE_REPO) without editing package.json, and refuses to publish to
 * a repo it cannot verify is public. Embedding a token in the app instead
 * would hand a repo-read credential to every customer — never do that.
 */
const { spawnSync } = require('child_process');

const owner = process.env.COOP_RELEASE_OWNER || 'Abdulkadir447';
const repo = process.env.COOP_RELEASE_REPO || 'Co-Op';
const skipCheck = process.env.COOP_RELEASE_SKIP_CHECK === '1';

function log(msg) {
  process.stdout.write(`[release] ${msg}\n`);
}

function isPublic() {
  // Best-effort, offline-safe: `gh` is the tool the repo already uses for
  // GitHub operations. Without it (or without auth) we cannot tell, and we
  // say so rather than blocking a local build.
  const res = spawnSync('gh', ['api', `repos/${owner}/${repo}`, '--jq', '.private'], {
    encoding: 'utf8',
  });
  if (res.status !== 0) return null;
  return res.stdout.trim() === 'false';
}

function main() {
  if (!skipCheck) {
    const pub = isPublic();
    if (pub === false) {
      log(`REFUSING: ${owner}/${repo} is private.`);
      log('electron-updater cannot download release assets from a private repo,');
      log('so shipped apps would never update. Point COOP_RELEASE_REPO at a');
      log('PUBLIC releases-only repo (see docs/RELEASE.md).');
      log('Override with COOP_RELEASE_SKIP_CHECK=1 only for a local dry run.');
      process.exit(1);
    }
    if (pub === null) {
      log('could not verify repository visibility (gh unavailable or unauthenticated).');
      log('continuing — but verify the releases repo is public before shipping.');
    }
  }

  log(`publishing ${owner}/${repo}`);
  const args = [
    'electron-builder',
    '--publish',
    'always',
    '-c.publish.provider=github',
    `-c.publish.owner=${owner}`,
    `-c.publish.repo=${repo}`,
  ];
  const res = spawnSync('npx', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  process.exit(res.status === null ? 1 : res.status);
}

main();
