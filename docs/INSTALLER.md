# Building the Windows installer

The app is packaged with `electron-builder`. The workflow that does it is
`.github/workflows/desktop.yml`, and it runs on GitHub's Windows runners —
not on a laptop, and not in this repo's Linux CI. Two reasons:

1. `better-sqlite3` is native. Building it for Windows needs the MSVC toolchain
   that only a Windows runner has.
2. electron-builder downloads ~100 MB of Electron, NSIS and winCodeSign
   binaries. On a datacenter connection that is seconds; on a home connection
   it is the "electron-builder hangs" that sends people looking for a bug.

## Why `.exe` and not `.msi`

You asked for an `.msi`. What ships is a **single `.exe` NSIS installer**, which
is what the config was already set up for, and it is the better choice here:

| | NSIS `.exe` (what we build) | `.msi` |
|---|---|---|
| Needs admin rights | No — per-user install into `%LOCALAPPDATA%` | Usually yes, per-machine |
| Install location | User can change it, no UAC prompt | Fixed, prompts for elevation |
| Auto-update | Direct: `electron-updater` replaces the app dir | Needs a separate updater path |
| Uninstall entry | Added to Add/Remove Programs either way | Same |

An `.msi` would need WiX, a per-machine install, and UAC — worse for a
shopkeeper on a shared or locked-down PC, and it would break the auto-updater
in `electron/updater.js`, which reads `latest.yml` from the release. If you
specifically need `.msi` for a distributor or an IT department, say so and it
can be added as a second target; it is a config change, not a rewrite.

## Running it

**Actions → "Desktop installer (Windows)" → Run workflow.** Two inputs:

| Input | What it is | Where to get it |
|---|---|---|
| `api_url` | Backend base URL baked into the app, e.g. `https://api.coop.ng` | **Does not exist yet.** Leave blank for a test build. |
| `clerk_key` | `pk_live_…` or `pk_test_…` — the **publishable** key | Clerk dashboard → API keys. Never the `sk_…` secret. |
| `publish` | `artifact-only` (default) or `publish-release` | — |

The run produces an artifact named `coop-windows-installer` (or
`…-UNCONFIGURED`) containing:

- `Co-op-<version>-setup.exe` — the installer
- `latest.yml` + `.blockmap` — what the in-app updater reads

### The Clerk key is a hard requirement, on purpose

`frontend/src/main.tsx` throws at **runtime** when the key is missing, but
`vite build` still exits 0. A build without it therefore produces an installer
that dies on launch with no build error to warn you. The workflow refuses to
produce one rather than let that ship.

## What the artifact can and cannot do today

This is the part to read before handing the `.exe` to anyone.

**It can:** install, create shortcuts, launch, and show the sign-in screen.
Clerk is a hosted service, so signing in works with only the publishable key.

**It cannot:** show a single order, product or invoice. There is no backend
deployed, so every data call fails. It is a shell with a login screen.

So today the honest description is *"the packaging pipeline works"*, not
*"the product is downloadable"*. Two things turn it into the latter:

1. A deployed backend → pass its URL as `api_url`.
2. Real trial accounts, so a shopkeeper can sign in and see their own shop.

## Publishing a release

Push a tag — the workflow builds, then publishes the installer, `latest.yml`
and `.blockmap` to a GitHub Release, which is what `/trial` links to and what
the auto-updater polls:

```sh
git tag v1.0.0
git push origin v1.0.0
```

The tag must be `v<semver>`; the workflow copies the version into
`electron/package.json` so the updater compares the right numbers. The backend
URL comes from the repository variable `COOP_API_URL` when the run is
tag-triggered (Settings → Secrets and variables → Actions → **Variables**), and
the Clerk key from `VITE_CLERK_PUBLISHABLE_KEY`. Both are variables, not
secrets: they are baked into the bundle and are public by design.

## Code signing

**The installer is unsigned.** Windows SmartScreen will show *"Windows
protected your PC — unknown publisher"* and most people will stop there. This
is not a bug in the build; it needs a certificate:

- An OV code-signing certificate is roughly $100–300/year and still needs
  reputation before SmartScreen stops warning.
- An EV certificate gives immediate reputation but costs more and ships on a
  hardware token, which does not work on a cloud runner — it needs a signing
  service.

Until one of those exists, the build is honest about it: the release notes must
say the installer is unsigned, and `/trial` must not imply otherwise. When a
certificate is bought, electron-builder signs automatically from
`CSC_LINK` / `CSC_KEY_PASSWORD` (or `WIN_CSC_LINK`) in the environment — no
config change needed.
