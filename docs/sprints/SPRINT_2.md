# Sprint 2: Safe Scanner Foundation And Windows/WSL Discovery

## Objective
Demo a local scan that returns structured inventory metadata, source evidence, read/parse errors, safe previews, and Windows/WSL-aware roots without broad client-specific parsing.

## Tasks
- [x] **Task 2.1**: Replace raw file-body scan results with structured scan records
  - Refactor the Rust command response away from unconditional `{ path, content }` records toward resources, source locations, metadata, optional safe previews, skipped-sensitive records, and errors.
  - Keep compatibility shims only where needed during migration.
  - Validation: Rust serialization tests verify resources can be returned without raw content.

- [ ] **Task 2.2**: Implement scanner read policy before broad discovery
  - Add scanner rules that decide whether a file can be read as safe markdown, read and redacted, represented as metadata-only, or skipped as sensitive.
  - Apply metadata-only behavior to logs, sessions, auth stores, token files, environment files, credential files, memory stores, and cache traces.
  - Validation: Unit tests prove sensitive/log/session paths do not produce raw preview content.

- [ ] **Task 2.3**: Add redaction primitives used by scanner and UI
  - Implement redaction for API-key-like strings, bearer tokens, OAuth-looking tokens, password fields, env file assignments, and file-secret references.
  - Return warnings for inline secret-like values without exposing raw values.
  - Validation: `npm run test -- src/lib/inventory/redaction.test.ts` passes with positive and negative fixtures.

- [ ] **Task 2.4**: Create a cross-platform known-location registry
  - Define known machine-level and profile-level search roots for all six clients, including Windows, macOS, Linux, and WSL-accessible homes where applicable.
  - Represent missing locations as known-but-not-found evidence for client status calculations.
  - Validation: Registry tests cover each client and each supported OS family.

- [ ] **Task 2.5**: Preserve and extend Windows build support for WSL homes
  - Keep discovery of WSL distro homes through both `\\wsl.localhost` and `\\wsl$` for Windows builds.
  - Add duplicate suppression when both UNC namespaces expose the same distro/home.
  - Add stable source IDs for UNC paths so resource identity does not change between namespaces.
  - Validation: Pure Rust tests simulate both UNC namespaces and prove duplicate roots collapse to one logical WSL home.

- [ ] **Task 2.6**: Add path normalization and scope primitives
  - Normalize POSIX paths, Windows paths, and WSL UNC paths without losing the original display path.
  - Add helpers for global, project-shared, local-private, profile-scoped, managed-admin, plugin-bundled, and unknown scope evidence.
  - Validation: Path tests cover `/home/user/repo`, `C:\\Users\\user\\repo`, `\\wsl.localhost\\Ubuntu\\home\\user\\repo`, and `\\wsl$\\Ubuntu\\home\\user\\repo`.

- [ ] **Task 2.7**: Capture scanner errors as user-visible records
  - Return read errors, stat errors, parse errors, oversized-file skips, permission denials, and missing included files as warnings/resources instead of only logging to stderr.
  - Validation: Rust tests with unreadable or simulated error entries produce `read-error` or `needs-review` statuses.

- [ ] **Task 2.8**: Keep scanner passive and bounded
  - Preserve no symlink following, max depth, max file size, max result count, dependency/build directory skips, and no command execution.
  - Add explicit tests for not following symlinks, including simulated Windows/WSL roots.
  - Validation: `cargo test` passes and tests prove symlink targets are not scanned.

- [ ] **Task 2.9**: Align browser dev scanner with the Tauri contract
  - Update Vite dev scanner endpoints to return the same structured scan contract as the Rust backend.
  - Ensure browser production still explains that local scanning requires the desktop app.
  - Validation: `npm run test -- vite.config.test.ts` or equivalent scanner contract tests pass.

- [ ] **Task 2.10**: Build a machine inventory shell from scanner metadata
  - Show scan roots, known client locations, found/not-found/partial client states, scanner errors, and safe empty states before deep client parsing exists.
  - Do not show raw file bodies in the shell.
  - Validation: `npm run check`, `npm run build`, and a manual dev scan show scanner metadata grouped by client/location.

- [ ] **Task 2.11**: Review Tauri permissions for scanner-only access
  - Verify the app still uses narrow Rust commands rather than broad renderer filesystem permissions.
  - Document any permission added for future folder selection separately from scanner internals.
  - Validation: `src-tauri/capabilities/default.json` remains minimal and `npm run tauri:build` is not blocked by capability configuration where the environment supports it.
