# Sprint 3: Core Client Machine Inventory

## Objective
Demo Machine Inventory for Claude Code, Claude Desktop, Codex, and Cursor, including global/profile config locations, MCP server extraction, source evidence, parse errors, sensitive stores, and safe caveats.

## Tasks
- [x] **Task 3.1**: Choose and document parser strategy for config formats
  - Decide whether JSON, TOML, and YAML-like configs use dependencies or explicit best-effort parsers.
  - Document parser guarantees and caveats in `docs/V1_MODEL.md` or a dedicated parser note.
  - Validation: Parser strategy doc names supported formats, unsupported constructs, and how parse errors appear in inventory.

- [x] **Task 3.2**: Add shared JSON config parsing with source evidence
  - Parse JSON files into typed extraction helpers that can report parse errors, key paths, and redacted previews.
  - Preserve original path and parsed key path in evidence.
  - Validation: JSON parser tests cover valid config, malformed config, nested MCP keys, and secret-like fields.

- [x] **Task 3.3**: Add TOML config parsing for Codex-style configs
  - Parse TOML enough to find client config, MCP definitions, hooks, custom agents, auth references, and malformed files.
  - If a dependency is added, keep it justified in the parser strategy doc.
  - Validation: TOML parser tests cover valid MCP config, malformed TOML, inline secret warning, and unknown tables.

- [x] **Task 3.4**: Extract MCP server resources without starting commands
  - Add extraction helpers that identify MCP server name, command/package/url hints, env var references, source config path, and "configured/not tested" status.
  - Never execute MCP commands during extraction.
  - Validation: Tests assert extraction returns `not-tested` or `found` and never attempts process execution.

- [ ] **Task 3.5**: Implement Claude Desktop detector
  - Detect Claude Desktop MCP config and log/session presence as global desktop-level resources.
  - Make exact config path prominent and add restart-required caveat.
  - Validation: Fixture tests cover found config, wrong/missing path, malformed MCP config, logs presence, and no project scope.

- [ ] **Task 3.6**: Implement Claude Code detector
  - Detect global and project-aware Claude Code settings, skills, commands, MCP definitions, instruction files, local/private settings, hooks, plugins, and permission-like resources where present.
  - Mark project-scoped skills/servers/hooks as needs-review when activation depends on trust.
  - Validation: Detector tests cover global `.claude`, repo `.claude`, settings.local-style local/private files, project MCP, and trust caveats.

- [ ] **Task 3.7**: Implement Codex detector for user/system/admin resources
  - Detect Codex user, project, and system/admin configs; AGENTS files; `.agents` skills/plugins; MCP servers; hooks; custom agents; auth stores; managed/admin settings.
  - Represent Codex layers without claiming trust-gated project resources are active when trust is unknown.
  - Validation: Detector tests cover user config, `/etc/codex`, project AGENTS, `.agents` skill locations, managed/admin config, and trust-gated caveats.

- [ ] **Task 3.8**: Implement Cursor detector for global and project resources
  - Detect Cursor global MCP config, project MCP config, project `.cursor/rules/*.mdc`, legacy `.cursorrules`, and schema mismatch warnings.
  - Clearly distinguish global MCP servers from project MCP servers.
  - Validation: Detector tests cover global MCP, project MCP, valid MDC rules, malformed MDC frontmatter, and legacy `.cursorrules`.

- [ ] **Task 3.9**: Add core-client client summaries
  - Compute installed/configured/partially-configured/not-found status for Claude Code, Claude Desktop, Codex, and Cursor from known locations and resources.
  - Include readable/parseable counts and top caveats.
  - Validation: Summary tests cover found, partial, not-found, parse-error, and read-error states.

- [ ] **Task 3.10**: Render core clients in Machine Inventory
  - Group resources by client and resource type, show source paths, scopes, statuses, warning counts, and safe previews where allowed.
  - Keep fixture mode and local scan mode visually distinct.
  - Validation: `npm run test`, `npm run check`, and `npm run build` pass; fixture demo shows all four core clients.

- [ ] **Task 3.11**: Add large-inventory table safeguards
  - Ensure sorting, filtering, and rendering use metadata and redacted previews rather than raw file bodies.
  - Add pagination or virtualization-friendly structures if needed for thousands of resources.
  - Validation: A generated large fixture renders without raw body search dependency and without excessive UI stalls in browser dev mode.
