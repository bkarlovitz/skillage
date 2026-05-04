# Sprint 4: Hermes And OpenClaw Profile/State Inventory

## Objective
Demo Machine Inventory support for Hermes and OpenClaw, with profile-scoped resources, included config evidence, sensitive store/log/session presence, and client-specific caveats.

## Tasks
- [x] **Task 4.1**: Implement Hermes profile discovery
  - Detect Hermes default profile and named profiles as distinct profile-scoped environments.
  - Keep profile resources separate unless client behavior clearly indicates inheritance.
  - Validation: Hermes detector tests cover default profile, two named profiles, and no cross-profile merging.

- [x] **Task 4.2**: Detect Hermes config, MCP, skills, and bundled resources
  - Detect Hermes MCP servers, user skills, bundled skills, optional skills, config files, and cache/quarantine artifacts.
  - Mark cache/quarantine artifacts as internal or temporary and keep them hidden by default unless the UI exposes an internal-artifacts filter.
  - Validation: Tests cover active user skills, bundled skills, optional skills, cache artifacts, and MCP config extraction.

- [x] **Task 4.3**: Represent Hermes sensitive files safely
  - Detect Hermes environment files, auth files, logs, and sessions as sensitive or log/session store resources.
  - Show presence, path, size, and metadata only by default.
  - Validation: Tests prove Hermes `.env`, auth, log, and session fixtures do not expose raw content.

- [x] **Task 4.4**: Implement OpenClaw state and profile discovery
  - Detect OpenClaw state directories, profiles, workspaces, config files, included config files, agents, skills, plugins/extensions, and migration/import sources where present.
  - Represent included-from evidence for split config files.
  - Validation: OpenClaw tests cover base state, profile resources, included config, missing include, and migration source detection.

- [x] **Task 4.5**: Extract OpenClaw MCP relationships carefully
  - Distinguish MCP servers consumed by OpenClaw from OpenClaw exposed as an MCP server to another client when evidence supports it.
  - Use needs-review or unknown when the role cannot be proven.
  - Validation: Tests cover consumed MCP, exposed MCP, ambiguous MCP config, and relationship caveats.

- [x] **Task 4.6**: Represent OpenClaw logs, sessions, memory, and credentials safely
  - Detect logs, sessions, credentials, cache traces, token files, and memory stores as sensitive or log/session resources with metadata-only previews.
  - Validation: Tests prove no raw OpenClaw log/session/credential/memory body reaches the UI model.

- [x] **Task 4.7**: Add OpenClaw skill precedence and shadowing hints
  - Detect skill precedence or shadowing only where source paths/config provide enough evidence.
  - Use needs-review when precedence is uncertain.
  - Validation: Tests cover global/profile/workspace skill name collisions with shadowed, same-name-only, and needs-review outcomes.

- [x] **Task 4.8**: Add remote/local gateway caveats for OpenClaw
  - Surface caveats that local desktop inventory may not own full runtime state when OpenClaw appears configured for gateway or remote mode.
  - Validation: Fixture tests show gateway caveat when remote/gateway hints are present and no caveat when absent.

- [x] **Task 4.9**: Add Hermes and OpenClaw client summaries
  - Compute installed/configured/partially-configured/not-found status, profile counts, sensitive store counts, and caveats for both clients.
  - Validation: Summary tests cover found, not-found, partial, profile-only, and sensitive-store-only states.

- [ ] **Task 4.10**: Complete Machine Inventory for all six clients
  - Update the Machine Inventory view so all six clients render consistently while preserving client-specific scope/profile distinctions.
  - Validation: `npm run test`, `npm run check`, and `npm run build` pass; fixture demo shows found/not-found/partial states for all six clients.

- [ ] **Task 4.11**: Update standard-location discovery for all six clients
  - Ensure local scan roots include all six clients on supported OSes, including Windows user locations and WSL homes for the Windows build.
  - Validation: Root registry tests prove each client has Windows, WSL, Linux, and macOS coverage where applicable.
