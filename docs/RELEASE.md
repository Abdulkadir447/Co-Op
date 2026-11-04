# Release runbook — building, signing and shipping desktop installers

Everything here was written against the code in this tree. Where a step needs
something that cannot be produced in a repository (a certificate, an Apple
account, a Windows machine), it says so plainly instead of pretending a script
covers it.

## What the build produces

| Command (from `electron/`) | Output | Platform |
|---|---|---|
| `npm run build:renderer` | `electron/renderer-dist/` (the Vite app + baked API origin) | any |
| `npm run pack` | unpacked app directory in `electron/dist/` | current OS |
| `npm run dist` | installer(s), never published | current OS |
| `npm run release` | installer(s) + publish to GitHub Releases | current OS |

`electron-builder` only builds what the host OS supports:

- **Windows (NSIS)** — needs Windows (or Wine on Linux, which is not
  recommended for a release artefact).
- **macOS (DMG)** — needs macOS.
- **Linux (AppImage)** — builds anywhere with `fakeroot`.

A single Linux machine therefore ships Linux builds only. Build Windows on
Windows; build macOS on macOS (or a CI macOS runner).

## The native module that will bite you (better-sqlite3)

`better-sqlite3` is a **native** addon. It must be compiled against Electron's
Node ABI, not the system Node's, or the packaged app dies at launch with a
`NODE_MODULE_VERSION` mismatch.

- `electron-builder` runs `electron-rebuild` automatically for
  `dependencies` (`npmRebuild` defaults to `true`) — do not set it to `false`.
- Verify a packaged build actually launches **before** uploading it. A build
  that compiles is not a build that runs.
- If the sandbox/CI has no network to `nodejs.org`, the rebuild cannot fetch
  headers and will fail. That is an environment problem, not a code problem —
  it must be built where `node-gyp` can reach its headers.

## Code signing — the part that is a purchase, not a commit

Unsigned Windows installers show **"Windows protected your PC — Unknown
publisher"**, and unsigned/un-notarized macOS builds are refused by Gatekeeper
outright. Neither can be fixed in this repository.

### Windows

1. Buy an OV/EV code-signing certificate (or use Azure Trusted Signing).
2. Export it as a `.pfx`.
3. Set the environment variables `electron-builder` reads automatically:

```sh
export CSC_LINK="/absolute/path/to/cert.pfx"   # or a base64 data URL
export CSC_KEY_PASSWORD="••••••"
```

4. Rebuild. Signing is applied by the packager; no config change is required.
   `electron/package.json` deliberately carries no `certificateFile` path —
   a path in the repo would leak the machine layout and be wrong everywhere
   else.

### macOS

```sh
export CSC_LINK="/path/to/DeveloperIDApplication.p12"
export CSC_KEY_PASSWORD="••••••"
export APPLE_ID="you@example.com"                 # notarization
export APPLE_APP_SPECIFIC_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="TEAMID1234"
```

Notarization also needs `"notarize": true` under the `mac` block in
`electron/package.json` (electron-builder 24 supports it) and a hardened
runtime. Apple Developer membership is $99/yr.

**Until signing exists, do not sell the desktop download.** Ship it to design
partners with a sentence explaining the warning; do not let a stranger meet it
alone.

## Auto-update and a private repository — read this before flipping visibility

`electron-updater` fetches releases from the GitHub repo named in
`build.publish` (currently `Abdulkadir447/Co-Op`).

**GitHub requires authentication to download release assets from a private
repository.** So if that repo is made private and the app keeps pointing at
it, every customer's auto-update silently 404s (the app keeps working; it just
never updates). The two bad workarounds are:

- embedding a GitHub token in the app — **never**: it is a repo-read credential
  handed to every customer, extractable from the asar; or
- leaving the repo public (which is the current situation, and contradicts
  `LICENSE`).

The correct shape is **private source + public releases**:

```sh
export COOP_RELEASE_OWNER="Abdulkadir447"
export COOP_RELEASE_REPO="coop-releases"   # a separate PUBLIC repo, releases only
npm run release
```

`npm run release` runs `electron/scripts/release.js`, which forwards those two
values to `electron-builder` (`-c.publish.owner/repo`) without editing
`package.json`. The public releases repo holds installers and `latest.yml`
only — no source. Keep `Abdulkadir447/Co-Op` private.

Decide this **before** the first customer installs, because changing the
publish target later means old installs never see the new feed.

## Release checklist

1. `cd frontend && npm run build` — clean.
2. Backend gates from the repo root: `ruff check backend/` and `pytest` — green.
3. `cd electron && npm test` — green (includes the Windows-only group on Windows).
4. Bump `version` in `electron/package.json` (the updater compares this string).
5. Build on the target OS, install the artefact on a **clean** machine, launch,
   sign in, create an order, record a payment, export a report, restart.
6. Confirm the app reaches the API origin baked at build time (`VITE_API_URL`).
   A build made without it falls back to same-origin and will fail in the
   desktop shell.
7. Publish, then verify the update path: install version N, ship N+1, and watch
   it download (the defer deadline is 7 days — see `electron/updater.js`).

## What is still not automated

- The version bump (deliberate — it is a human decision, not a derived value).
- Any signing or notarization step (needs credentials).
- A packaged-app smoke test (needs a real OS + a real install; the E2E harness
  in `electron/e2e/` drives the built renderer, not an installed artefact).
