# Changelog

All notable public changes to T3 Code Pets are recorded here. Framework and individual pet versions are independent.

## 1.0.0 - 2026-08-15

First public release candidate.

### Framework

- Added transactional install, update, T3 update, recovery, doctor, and uninstall commands for supported T3 source checkouts.
- Added exact, fail-closed compatibility for T3 commits `78f462c4e18c8ea5e5037dc916389a3b72246025`, `560d4a4560ddb5f42c8f8e0e35fa7827c0e46f80`, and `f0719072a1c6435b5a91243afc57bc8bf1f3e2b6`.
- Added native Settings -> Pets integration, browser IndexedDB persistence, configurable 20%-80% sizing in 5% steps, cursor curiosity, and automatic inward-facing orientation.
- Added deterministic `.t3pet` validation and packaging with bounded archive, manifest, WebP, and spritesheet checks.
- Added stable and versioned release tarballs, SHA-256 checksums, public package metadata, and blocking cross-platform release gates.
- Added restart guidance for installs and updates performed while a T3 Vite development process may be open.

### Romeo 1.0.0

- Added Romeo, the golden British Shorthair, with idle, run, wave, jump, failure, waiting, working, review, and 16-direction pointer animations.
- Added hover waving, click paw-punching, direction-aware drag hopping, active-work bursts, calm idle breaks, and automatic left/right atlas selection.
