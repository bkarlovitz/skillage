# Manual Acceptance Notes

Date: 2026-05-04

Environment: WSL2 Linux development environment. Native Windows smoke testing is documented separately in `docs/WINDOWS_WSL_SMOKE_TEST.md`.

## Method

This pass used the v1 acceptance fixture scenarios and regression tests as the walkthrough data set:

- `acceptance-machine-inventory`
- `acceptance-project-inventory`
- `acceptance-client-detail`
- `acceptance-cross-client`
- `acceptance-source-path-clarity`
- `acceptance-safety`
- empty local scan regressions
- passive scanner and secret regression fixtures

The walkthrough followed the app surfaces a user sees: no project selected, selected project, each client detail view, cross-client view, resource detail panels, and scanner metadata.

## No Project Selected

Surface: `Machine Inventory`

Observed result: Accepted.

- The empty machine fixture and empty local scan regression keep the app empty when no local resources are found.
- Fixture/demo resources are not loaded automatically for a real empty local scan.
- The machine inventory acceptance fixture shows all six supported ecosystems: Claude Code, Claude Desktop, Codex, Cursor, Hermes, and OpenClaw.
- The view exposes known locations, scan roots, source paths, scopes, statuses, warnings, sensitive store presence, log/session store presence, parse errors, and read errors.

V1 outcome confirmed: a user can open the app without selecting a project and see which ecosystems appear present, where global/profile config lives, which global/profile resources exist, which sensitive stores exist without raw secrets, and which files could not be read or parsed.

## Selected Project

Surface: `Project Inventory`

Observed result: Accepted.

- The selected project fixture shows `repo` as the selected project context.
- Project-shared resources, inherited global/profile resources, local/private resources, shared metadata, and warnings/caveats are all present.
- The best-effort effective view contains resources with activation caveats rather than unsupported certainty.
- Shared project metadata identifies collaborator-visible files.
- Secret/auth and runtime caveats appear as warnings instead of raw config exposure.

V1 outcome confirmed: a user can select a project folder and see project-scoped config, inherited global/profile resources, project skills/instructions/MCP/rules/hooks/plugins where applicable, likely shared files, trust-sensitive warnings, and a best-effort effective view.

## Client Detail Views

Surface: `Clients` and each client detail view

Observed result: Accepted for all supported clients.

- Claude Code: known locations, grouped resources, evidence rows, and caveats are visible.
- Claude Desktop: known locations, MCP/config evidence, sensitive/log store counts, and caveats are visible.
- Codex: known locations, instruction/config/plugin/hook evidence, profiles or stores where applicable, and caveats are visible.
- Cursor: known locations, rule/MCP/config evidence, parse/read caveats, and source paths are visible.
- Hermes: known locations, profile/environment resources, sensitive/log stores, and caveats are visible.
- OpenClaw: state/profile/workspace/config/plugin/store resources and migration/source caveats are visible.

V1 outcome confirmed: each client can be inspected according to its own model while still using normalized client, type, scope, status, evidence, warning, and preview fields.

## Cross-Client View

Surface: `Cross-Client`

Observed result: Accepted.

- Duplicate MCP examples show each instance, client, scope, source location, and relationship label.
- Same-name-only skill examples avoid claiming identity from name alone.
- Shadowed project/global examples show relationship and source context.
- Drilldown rows preserve source locations for grouped resources.

V1 outcome confirmed: a user can compare similar capabilities across clients and see where each instance exists, who owns it, what scope it has, and whether the app believes entries are duplicates, related, shadowed, or merely similarly named.

## Source-Path Clarity

Surfaces: `Machine Inventory`, `Project Inventory`, client detail, `Cross-Client`, and resource detail panels

Observed result: Accepted.

- Machine inventory rows expose source paths or explicit unknown-source labels.
- Project inventory rows expose source paths or explicit unknown-source labels.
- Client detail evidence rows expose source paths, source labels, or explicit unknown-source labels.
- Cross-client groups and drilldown rows preserve source locations.
- Safe detail panels include `Source Evidence` and use `unknown source` when a source cannot be known.

V1 outcome confirmed: for every discovered resource where a source can be known, the user can see the path or source location that caused it to appear.

## Safety

Surfaces: normal inventory rows, client detail, scanner metadata, and `Safe Detail Panels`

Observed result: Accepted.

- Passive scanner audit fixtures prove inventory does not modify files, install packages, start MCP servers, authenticate to services, execute config commands, or deeply ingest logs/sessions.
- Secret regression fixtures cover inline API keys, bearer/OAuth-looking tokens, password fields, `.env` assignments, env var references, file-secret references, and auth-store presence.
- Sensitive stores use `unread-sensitive`.
- Log/session stores use `metadata-only`.
- Safe markdown previews redact secret-like values before display.
- Raw secret, log, session, transcript, cache trace, and memory body text is not shown during normal inventory.

V1 outcome confirmed: normal inventory remains passive and does not reveal raw secrets or ingest logs/sessions deeply without explicit opt-in.

## Validation Commands

Run for this acceptance pass:

```bash
npm run test -- src/lib/inventory/acceptanceFixtures.test.ts src/lib/inventory/sourcePathClarityAcceptance.test.ts src/lib/inventory/emptyScanRegression.test.ts src/lib/inventory/passiveScannerAudit.test.ts src/lib/inventory/secretRegression.test.ts src/lib/inventory/manualAcceptance.test.ts
npm run check
npm run build
```

Packaging gates are recorded in `docs/PACKAGING_QUALITY_GATES.md`.

Final result: accepted for v1 local acceptance.
