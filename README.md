# T3 Code Pets

Animated, state-aware pets for source checkouts of [T3 Code](https://github.com/pingdotgg/t3code), installed without maintaining a fork.

Romeo appears in **Settings -> Pets**. He waves while hovered, paw-punches when clicked, and hops in the live drag direction. During T3 activity he periodically returns to working or waiting animations between calm idle breaks. Cursor curiosity, crisp 5% size steps, and automatic inward-facing orientation are configurable.

## Requirements

- Node.js 24.13.1 and Corepack
- Git
- a T3 Code source checkout at an exact commit in the [compatibility table](docs/compatibility.md)
- a clean T3 working tree, apart from files already owned by Pets

Stop every T3 development process using the checkout before installing, updating, changing T3 versions, or uninstalling Pets. Start T3 again only after the command finishes.

## Quick start

For a new checkout of the newest supported tagged T3 release:

```powershell
git clone --depth 1 --branch v0.0.34-nightly.20260812.1072 https://github.com/pingdotgg/t3code.git t3code
cd t3code
npx --yes --package=https://github.com/RaymondWKWong/t3code-pets/releases/latest/download/t3code-pets.tgz t3code-pets install --check
npx --yes --package=https://github.com/RaymondWKWong/t3code-pets/releases/latest/download/t3code-pets.tgz t3code-pets install
corepack pnpm@11.10.0 dev
```

`install --check` is a read-only compatibility plan. The installer then verifies the exact T3 commit and source structure, applies a transaction, installs dependencies, and runs the T3 web build, typecheck, and tests. It rolls back if validation fails.

The release contains the CLI, runtime packages, compatibility adapter, and Romeo, so users do not install separate `@t3code-pets/*` packages.

For a reproducible version-pinned install, replace the stable URL with:

```text
https://github.com/RaymondWKWong/t3code-pets/releases/download/v1.0.0/t3code-pets-1.0.0.tgz
```

Release checksums are published as `SHA256SUMS.txt` beside both tarballs.

## Everyday commands

Run commands from the T3 checkout while its development process is stopped:

```powershell
npx --yes --package=https://github.com/RaymondWKWong/t3code-pets/releases/latest/download/t3code-pets.tgz t3code-pets doctor
npx --yes --package=https://github.com/RaymondWKWong/t3code-pets/releases/latest/download/t3code-pets.tgz t3code-pets update
npx --yes --package=https://github.com/RaymondWKWong/t3code-pets/releases/latest/download/t3code-pets.tgz t3code-pets t3-update --check
npx --yes --package=https://github.com/RaymondWKWong/t3code-pets/releases/latest/download/t3code-pets.tgz t3code-pets t3-update
npx --yes --package=https://github.com/RaymondWKWong/t3code-pets/releases/latest/download/t3code-pets.tgz t3code-pets uninstall
```

Start T3 again after any successful mutation. `doctor` verifies the T3 commit, adapter, managed fingerprints, Git ownership, and transaction state. Add `--json` for machine-readable output, or `--t3 <path>` when running outside the checkout.

`update` transactionally replaces the Pets framework without changing browser-stored pet choices. `t3-update` fetches upstream, refuses unsupported or non-fast-forward targets, validates a supported target in a disposable worktree, then updates T3 and reinstalls Pets. `uninstall` restores verified backups and removes only Pets-owned files. Use `recover` only when a command reports an interrupted transaction.

## Troubleshooting

### Vite cannot resolve `@t3code-pets/t3`

This normally means T3 remained open while an install or update replaced its local package link. Stop the T3 development process completely, start it again, then hard-refresh the page. Do not rerun the installer merely to clear this cached Vite error.

### The T3 commit is unsupported

Pets deliberately refuses unknown commits before writing files. Check [the compatibility table](docs/compatibility.md), switch to a listed T3 tag or commit, or wait for a tested Pets release that adds the new commit.

### The installer reports unowned changes

Commit or stash your T3 changes, then rerun `install --check`. Pets never assumes unrelated working-tree changes are safe to overwrite.

### A transaction needs recovery

Run:

```powershell
npx --yes --package=https://github.com/RaymondWKWong/t3code-pets/releases/latest/download/t3code-pets.tgz t3code-pets recover
npx --yes --package=https://github.com/RaymondWKWong/t3code-pets/releases/latest/download/t3code-pets.tgz t3code-pets doctor
```

## Why this is not a fork

T3 Code remains the upstream checkout. A small structural adapter makes exact integration edits for listed T3 commits, while the reusable runtime lives under the ignored `.t3code-pets` directory. Unknown commits, changed source structures, altered managed files, corrupt backups, and unsafe update targets are rejected before mutation.

Supporting a new T3 release means inspecting a small set of host integration points and passing a clean-checkout lifecycle gate. It does not require merging a long-lived T3 fork. See [compatibility maintenance](docs/compatibility.md) and the [upstream extension-hook proposal](docs/upstream-extension-hooks.md).

## Pet packages and privacy

The Pets page imports inert `.t3pet` archives containing one strict manifest, two WebP atlases, and a WebP thumbnail. Executable files, remote references, traversal paths, and undeclared content are rejected. See [the pet format](docs/pet-format.md).

Pet data and settings stay in the browser's IndexedDB. Pets adds no server API and sends no pet data remotely.

T3 Code Pets framework `1.0.0` bundles Romeo pet `1.0.0`. Framework and pet versions are intentionally independent.

## Development

```powershell
corepack pnpm@11.10.0 install --frozen-lockfile
corepack pnpm@11.10.0 format:check
corepack pnpm@11.10.0 lint
corepack pnpm@11.10.0 typecheck
corepack pnpm@11.10.0 test
corepack pnpm@11.10.0 build
corepack pnpm@11.10.0 tsx scripts/verify-romeo-package.ts
corepack pnpm@11.10.0 build:release
corepack pnpm@11.10.0 tsx scripts/generate-support-table.ts --check
```

The versioned tarball, stable tarball, Romeo package, and checksums are written to `dist/`. Pull requests run add-on checks on Linux, Windows, and macOS plus clean-checkout compatibility tests. Tagged releases repeat all gates before publishing.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [CHANGELOG.md](CHANGELOG.md). T3 Code Pets is MIT licensed.
