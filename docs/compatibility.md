# T3 compatibility

Support is exact and fail-closed. A listed version is supported only at the listed full commit after the compatibility workflow passes. New upstream releases are never marked compatible automatically.

| T3 version | Commit     | Adapter     | Pets version | Observed tag                  |
| ---------- | ---------- | ----------- | ------------ | ----------------------------- |
| 0.0.33     | `78f462c4` | `t3-0.0.33` | 1.0.0        | v0.0.34-nightly.20260810.1059 |
| 0.0.33     | `560d4a45` | `t3-0.0.33` | 1.0.0        | v0.0.34-nightly.20260812.1072 |
| 0.0.33     | `f0719072` | `t3-0.0.33` | 1.0.0        |                               |

## Maintenance workflow

1. The scheduled workflow detects a new upstream commit and opens or updates one issue.
2. A maintainer runs the adapter inspection and clean-checkout install suite against that exact commit.
3. Structural differences are handled in a new or deliberately extended adapter with fixtures and refusal tests.
4. The exact version and 40-character commit are added to `compatibility.json` only after install, doctor, build, typecheck, tests, idempotence, and uninstall restoration pass.
5. A new Pets release bundles that catalog. Older releases remain pinned to their own tested catalog.

This process keeps maintenance bounded to small host integration points instead of merging a T3 fork.
