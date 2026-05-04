# Sprint 8: Acceptance Hardening And Windows/WSL Release Validation

## Objective
Demo the final v1 acceptance flow end to end in desktop mode, with safe inventory behavior, no raw secret/log leakage, source-path clarity, and preserved Windows build support for scanning WSL homes.

## Tasks
- [x] **Task 8.1**: Audit all resource previews for privacy
  - Review every UI path that can display resource content or metadata.
  - Ensure raw config, auth, log, session, memory, token, credential, and cache-trace content is never displayed during normal inventory.
  - Validation: UI privacy tests prove sensitive/log/session resources never expose raw body previews.

- [x] **Task 8.2**: Add end-to-end acceptance fixtures
  - Create fixture scenarios for Machine Inventory, Project Inventory, Client Detail, Cross-Client View, Source-Path Clarity, and Safety outcomes from `v1_spec.md`.
  - Validation: Acceptance tests load each fixture and assert the required user-facing outcome is visible.

- [x] **Task 8.3**: Add passive scanner audit tests
  - Prove normal inventory does not modify files, install packages, start MCP servers, authenticate to services, invoke shell commands from config, or deeply ingest logs/sessions.
  - Validation: Scanner audit tests use fixtures with executable-looking MCP commands and verify no process execution occurs.

- [x] **Task 8.4**: Add secret regression fixtures
  - Cover inline API keys, bearer tokens, OAuth-looking tokens, password fields, `.env` assignments, env var references, file-secret references, and auth-store presence.
  - Validation: Redaction regression tests pass and snapshots contain redaction markers instead of raw values.

- [x] **Task 8.5**: Add empty-scan regression coverage
  - Ensure a real empty machine scan and a real empty project scan remain empty and never load fixtures automatically.
  - Validation: Tests assert empty scan summaries render empty states with no demo resources.

- [x] **Task 8.6**: Validate source-path clarity across the app
  - Add checks that Machine Inventory, Project Inventory, Client Detail, and Cross-Client views show source paths or explicit unknown-source labels for all discovered resources.
  - Validation: Acceptance tests assert source path text or unknown-source labels are present in every resource detail fixture.

- [x] **Task 8.7**: Finalize Windows/WSL regression tests
  - Cover `\\wsl.localhost`, `\\wsl$`, duplicate namespace suppression, WSL home discovery, WSL project selection, UNC path normalization, stable IDs, and no symlink following.
  - Validation: Rust and TypeScript path tests pass on Linux while simulating Windows/WSL inputs.

- [x] **Task 8.8**: Add Windows build and WSL smoke-test checklist
  - Document how to run a Windows desktop build and verify it scans Windows user locations plus WSL homes on the same machine.
  - Include both UNC namespaces, duplicate handling, WSL home discovery, and secret/log redaction checks.
  - Validation: Checklist exists in docs and references the exact commands and expected UI results.

- [x] **Task 8.9**: Run packaging quality gates
  - Run the standard web and desktop checks in supported environments.
  - Capture any environment-specific limitations clearly in docs rather than hiding them.
  - Validation: `npm run test`, `cargo test`, `npm run check`, `npm run build`, and `npm run tauri:build` pass where the environment supports them.

- [ ] **Task 8.10**: Update README and implementation docs for v1
  - Describe the v1 inventory surfaces, supported clients, safety posture, non-goals, fixture/demo mode, project scanning, cross-client graph, and Windows/WSL behavior.
  - Remove obsolete MVP language that presents authoring, editing, distribution, or cross-machine workflows as current functionality.
  - Validation: review `README.md`, `docs`, and `src` for misleading current-state matches.

- [ ] **Task 8.11**: Complete final manual acceptance pass
  - Walk through the app as a user with no project selected, with a selected project, in each client detail view, and in cross-client view.
  - Verify the app answers where capabilities live, what scope they have, why they appear, what may affect the selected project, and what needs review.
  - Validation: Manual acceptance notes confirm the Machine Inventory, Project Inventory, Cross-Client, Source-Path Clarity, and Safety outcomes from `v1_spec.md`.
