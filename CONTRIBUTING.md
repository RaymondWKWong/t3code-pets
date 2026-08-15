# Contributing to T3 Code Pets

Contributions should preserve the standalone, fail-closed add-on model. Pets must remain uninstallable without leaving T3 changes behind, and it must never claim compatibility with an untested upstream commit.

## Development setup

Use Node.js 24.13.1 and the repository's pinned package manager:

```powershell
corepack pnpm@11.10.0 install --frozen-lockfile
corepack pnpm@11.10.0 test
corepack pnpm@11.10.0 typecheck
corepack pnpm@11.10.0 build
```

Keep changes focused. Add or update tests for behaviour changes, preserve JSON command output where possible, and avoid dependencies unless the requirement cannot be met clearly with the existing stack.

## Adding T3 compatibility

Compatibility is granted to an exact 40-character T3 commit, not a version range or floating branch.

1. Check out the upstream commit in a clean disposable directory.
2. Run the existing adapter inspection with `scripts/check-current-t3-adapter.ts`.
3. If host structure changed, add a new adapter or deliberately extend the existing adapter with fixtures and failure tests.
4. Add the exact version, commit, observed tag, and adapter ID to `compatibility/compatibility.json`.
5. Add the commit to `.github/workflows/t3-compatibility.yml` and the release smoke matrix.
6. Regenerate `docs/compatibility.md`.
7. Build a release artifact, install it into the clean checkout, run `doctor`, uninstall it, and confirm `git status --porcelain` is empty.

Never add a catalog entry solely because an earlier adapter compiles or because the T3 package version is unchanged. The real upstream checkout must pass inspection and the complete lifecycle.

## Pet contributions

Pet archives are inert data packages. Follow [docs/pet-format.md](docs/pet-format.md), keep the archive within its declared resource limits, and validate deterministic reconstruction. New artwork must have clear redistribution rights compatible with the repository licence.

## Required checks

Before requesting review, run:

```powershell
corepack pnpm@11.10.0 format:check
corepack pnpm@11.10.0 lint
corepack pnpm@11.10.0 typecheck
corepack pnpm@11.10.0 test
corepack pnpm@11.10.0 build
corepack pnpm@11.10.0 tsx scripts/verify-romeo-package.ts
corepack pnpm@11.10.0 build:release
corepack pnpm@11.10.0 tsx scripts/generate-support-table.ts --check
```

Describe the T3 commit used for compatibility work and include evidence from install, `doctor`, uninstall, and clean-status checks. Do not commit `dist/`, dependencies, coverage, or local T3 checkouts.
