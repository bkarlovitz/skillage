# Sprint 1: V1 Inventory Foundation And Product Reset

## Objective
Demo a runnable app shell that uses the v1 capability inventory language, explicit fixture data, safe preview policies, and the four primary views from `v1_spec.md`.

## Tasks
- [x] **Task 1.1**: Document the normalized v1 model
  - Create `docs/V1_MODEL.md` defining separate concepts for clients, resource types, scopes, statuses, warnings, relationships, source evidence, and content preview policy.
  - Include all six clients: Claude Code, Claude Desktop, Codex, Cursor, Hermes, and OpenClaw.
  - Include all resource types from `v1_spec.md`, including MCP server, sensitive store, log/session store, profile, workspace, permission, hook, plugin, custom agent, and migration/import source.
  - Validation: Review `docs/V1_MODEL.md` against `v1_spec.md` and confirm each spec resource type, scope, and status is represented once.

- [x] **Task 1.2**: Add TypeScript inventory domain types
  - Add a new inventory model module, such as `src/lib/inventory/types.ts`, with `CapabilityClient`, `CapabilityResourceType`, `CapabilityScope`, `CapabilityStatus`, `CapabilityWarning`, `CapabilityRelationship`, `CapabilityEvidence`, and `CapabilityResource`.
  - Keep client, type, scope, and status as separate enums/unions so values like `claude-desktop`, `mcp-server`, and `project-shared` cannot be mixed.
  - Validation: `npm run test -- src/lib/inventory/types.test.ts` passes after adding model shape tests.

- [x] **Task 1.3**: Define the scanner-to-UI contract
  - Add a contract for scan summaries that distinguishes discovered resources, known client locations, selected project context, scan roots, read errors, parse errors, skipped sensitive/log stores, and scanner warnings.
  - Include source evidence fields for scanner rule, matched path pattern, parsed key path, included-from path, and read/parse status.
  - Validation: Contract tests verify read errors and skipped sensitive resources can be represented without raw content.

- [x] **Task 1.4**: Define privacy and content preview policies
  - Add explicit policies such as `metadata-only`, `redacted-preview`, `safe-markdown-preview`, and `unread-sensitive`.
  - Ensure sensitive stores, auth files, logs, sessions, transcripts, cache traces, and memory stores default to metadata-only or unread-sensitive.
  - Validation: Redaction policy tests prove raw secret/log/session content is not previewable by default.

- [x] **Task 1.5**: Add fixture-backed demo scenarios
  - Replace implicit sample fallback data with explicit fixture scenarios for empty machine, full machine, project with inherited globals, duplicate MCP names, secret warning, parse/read error, and not-found clients.
  - Add a visible UI state that labels fixture/demo data separately from local scan data.
  - Validation: `npm run test -- src/lib/inventory/fixtures.test.ts` passes and a browser dev run can switch fixture scenarios without invoking local scanning.

- [x] **Task 1.6**: Replace old app navigation with v1 surfaces
  - Replace the current Inventory/Create/Product Notes nav with Machine Inventory, Project Inventory, Clients, and Cross-Client views.
  - Remove create/edit/draft affordances from the app shell because they are not part of this phase.
  - Validation: `npm run check` passes and the app renders all four top-level views from fixture data.

- [x] **Task 1.7**: Migrate table and detail helpers to capability resources
  - Update sorting, filtering, selection, detail lookup, and count helpers so they operate on `CapabilityResource` view models rather than `SkillItem`.
  - Quarantine or remove old `SkillItem` flows only after equivalent fixture tests exist.
  - Validation: Existing table/detail tests are migrated and `npm run test -- src/lib` passes.

- [ ] **Task 1.8**: Replace misleading empty-scan behavior
  - Ensure an empty local scan stays empty and shows an explicit empty state instead of restoring sample data.
  - Keep fixture/demo mode available through a deliberate UI choice or dev-only control.
  - Validation: Add a regression test proving a real empty scan does not load fixture data.

- [ ] **Task 1.9**: Update product copy and README for the v1 direction
  - Replace "skill management", creation, sync, and package-manager language with read-only capability inventory, explanation, scope clarity, and privacy-preserving scanning.
  - Keep future create/edit/install language only as non-goal or future-direction text.
  - Validation: `rg -n "Create skill|draft skill|sync|package manager|sample fallback" README.md src docs` shows no active-product wording for dropped features.

- [ ] **Task 1.10**: Preserve current app buildability during the reset
  - Keep browser dev, production build, and Tauri runtime imports compiling after the model and navigation changes.
  - Validation: `npm run test`, `npm run check`, and `npm run build` pass.
