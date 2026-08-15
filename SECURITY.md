# Security policy

## Supported versions

Security fixes are provided for the latest stable T3 Code Pets framework release. T3 host compatibility is narrower: only the exact commits in [docs/compatibility.md](docs/compatibility.md) are supported.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through **Security -> Advisories -> Report a vulnerability** in the GitHub repository. Do not open a public issue for archive traversal, arbitrary file writes, dependency substitution, unsafe source transformations, rollback failures, or other issues that could affect a user's checkout.

Include:

- the Pets framework version and exact T3 commit;
- operating system and Node.js version;
- the command and minimal reproduction;
- affected paths and observed result;
- whether any untrusted `.t3pet` archive is involved.

Do not include credentials, private source code, or unrelated user data. A maintainer will acknowledge the report, reproduce it in an isolated checkout, and coordinate disclosure after a fix and release are available.

## Security model

The installer accepts only exact known T3 commits and inspected structures. Filesystem writes are constrained to the checkout, managed files are fingerprinted, original content is backed up, and failed transactions roll back or surface explicit recovery state.

`.t3pet` imports are inert, bounded archives. Executable content, remote references, traversal paths, symlinks, encrypted entries, undeclared files, and invalid WebP atlases are rejected before browser storage changes.
