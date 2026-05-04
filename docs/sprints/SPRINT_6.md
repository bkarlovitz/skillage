# Sprint 6: Client Detail Views And Client-Specific Explanations

## Objective
Demo dedicated detail views for all six clients, each answering client-specific questions that the generic inventory cannot answer.

## Tasks
- [x] **Task 6.1**: Add client detail route/state and summary model
  - Create `ClientSummary` and detail view models with installed/configured/partially-configured/not-found state, known locations, readable/parseable status, resource counts, sensitive store counts, and caveats.
  - Validation: Summary model tests cover all client states and caveat aggregation.

- [x] **Task 6.2**: Show source evidence in detail views
  - Add a "Found because" or equivalent evidence section showing scanner rule, matched path pattern, parsed key path, included-from path, and read/parse status.
  - Validation: UI tests or fixture assertions prove detail views expose evidence for config-derived and path-derived resources.

- [x] **Task 6.3**: Implement Claude Code detail view
  - Show global/project settings, skills, project MCP definitions, instruction files, commands, hooks, plugins, local/private settings, and trust warnings.
  - Make project approval/trust caveats explicit.
  - Validation: Fixture demo answers where a Claude Code project MCP server came from and why it needs review.

- [x] **Task 6.4**: Implement Claude Desktop detail view
  - Show exact config path, global desktop MCP resources, logs presence, restart-required caveat, and not-found/wrong-path states.
  - Validation: Fixture demo answers the exact Claude Desktop config path and displays restart caveat without any restart action.

- [x] **Task 6.5**: Implement Cursor detail view
  - Show global MCP, project MCP, project rules, legacy rule warnings, and schema/parse mismatch warnings.
  - Validation: Fixture demo distinguishes Cursor global MCP from project MCP and shows a malformed config warning.

- [x] **Task 6.6**: Implement Codex detail view
  - Show layered user, project, system/admin, and managed resources; MCP servers; AGENTS files; skills; rules; hooks; custom agents; plugins; auth stores; and trust-gated project caveats.
  - Validation: Fixture demo answers which Codex layer introduced a resource and whether activation is trust-gated or unknown.

- [x] **Task 6.7**: Implement Hermes detail view
  - Show default and named profiles as distinct worlds, with MCP servers, skills, config, environment/auth files, log/session presence, and profile-specific caveats.
  - Validation: Fixture demo shows two Hermes profiles without merging their resources.

- [x] **Task 6.8**: Implement OpenClaw detail view
  - Show state directories, profiles, included config files, agents, workspaces, skills, MCP resources, plugins/extensions, sensitive stores, logs, sessions, memory stores, migration sources, and gateway caveats.
  - Distinguish consumed MCP from OpenClaw-exposed MCP when evidence supports it.
  - Validation: Fixture demo answers whether an OpenClaw MCP item is consumed, exposed, or needs review.

- [x] **Task 6.9**: Add client-specific explanation rules
  - Encode explanation snippets and caveats for restart requirements, profile worlds, trust gates, managed/admin settings, local/private files, gateway mode, and schema mismatch.
  - Keep explanations source-backed and avoid claiming runtime activity unless tested.
  - Validation: Explanation tests verify expected caveats for each client-specific scenario.

- [x] **Task 6.10**: Add not-found and partial-state fixtures for every client
  - Ensure each client detail page can render not-found, partially configured, configured, and parse-error scenarios.
  - Validation: Fixture tests cover every client state and `npm run check` passes.

- [x] **Task 6.11**: Replace generic resource-detail body previews with safe detail panels
  - Show safe markdown previews only for instruction/skill/rule resources.
  - Show redacted metadata-only panels for configs, auth stores, logs, sessions, memory, and sensitive stores.
  - Validation: UI tests prove sensitive resources never show raw body previews.
