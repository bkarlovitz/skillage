# Skillage

Local-first capability inventory for developer agent ecosystems.

Skillage is an open-source desktop app for developers who use multiple agents and need one place to inspect what agent capabilities exist on their machine, where they live, what scope they apply to, and which files may affect a selected project.

The v1 release is read-only and privacy-preserving. It inventories local resources for Claude Code, Claude Desktop, Codex, Cursor, Hermes, and OpenClaw without starting MCP servers, installing packages, editing config, publishing capabilities, syncing across machines, or reading sensitive logs and sessions in depth.

## V1 Status

This repository currently contains:

- A Svelte 5 + TypeScript UI and Tauri 2 desktop shell.
- Four v1 product surfaces: `Machine Inventory`, `Project Inventory`, `Clients`, and `Cross-Client`.
- A normalized capability-resource model with client, type, scope, status, source evidence, warnings, relationships, and preview policy.
- Explicit fixture scenarios for demo and development mode. Fixtures are user-selected; empty local scans stay empty.
- Local scanning for supported-client locations plus explicit scan roots.
- Project context resolution with selected path, git root when available, and source-path preserving display.
- Conservative cross-client grouping that distinguishes identical, duplicate, similar, shadowed, overridden, conflict, same-name-only, and no-relationship cases.
- Safe detail panels that show source metadata and redacted or safe markdown previews according to policy.
- Windows/WSL path support for `\\wsl.localhost` and `\\wsl$`, including duplicate namespace suppression and stable WSL identity.

## Supported Clients

Skillage v1 recognizes local resources for:

- Claude Code
- Claude Desktop
- Codex
- Cursor
- Hermes
- OpenClaw

Detected resource types include client installations, config files, MCP servers, skills, instruction files, rules, permissions, hooks, plugins, custom agents, profiles, workspaces, sensitive stores, log/session stores, and migration/import sources.

## Product Surfaces

`Machine Inventory` answers what supported agent resources exist across the local machine and known client locations. It shows client cards, scan roots, known locations, scanner records, resource rows, source paths, scopes, statuses, warnings, and safe previews.

`Project Inventory` answers what may affect a selected project. It separates project-shared resources, inherited global/profile resources, local/private resources, shared metadata, warnings/caveats, and a best-effort effective project view.

`Clients` and client detail views summarize each supported client by install/config state, known locations, readable/parseable evidence, sensitive/log store counts, client-specific rows, and caveats.

`Cross-Client` groups capabilities by normalized name and type so overlapping resources can be compared without pretending same-name items are automatically identical.

## Safety Posture

- Skillage is local-first: no account and no hosted backend are required.
- The scanner treats repository and client files as untrusted local text.
- Normal inventory is passive: it does not execute scripts, run MCP commands, install packages, authenticate to services, or modify files.
- Sensitive stores, auth files, logs, sessions, transcripts, cache traces, and memory stores are represented with `metadata-only` or `unread-sensitive` preview policies by default.
- Markdown-like skills, instructions, and rules may show safe previews, with secret-like values redacted before display.
- Native scanning is implemented through narrow Rust commands rather than broad renderer filesystem access.
- The Rust scanner skips dependency/build directories, does not follow symlinks, limits scan depth, limits result count, and skips oversized files.

## Non-Goals For V1

Skillage v1 is not a prompt authoring tool, config editor, MCP runtime host, package installer, marketplace, publishing flow, hosted service, or cross-machine sync system. Future write workflows should remain explicit, single-target, backed up, and diff-previewed before changing global or project files.

## Run Locally

```bash
npm install
npm run test
npm run check
npm run build
npm run dev
```

Then open the local Vite URL printed by the dev server. Browser dev mode can use fixture scenarios and the local dev scanner bridge; desktop scans require Tauri mode.

## Run As A Desktop App

```bash
npm run tauri:dev
```

To create release bundles:

```bash
npm run tauri:build
```

Recent Linux packaging gate results are recorded in `docs/PACKAGING_QUALITY_GATES.md`.

## Windows And WSL

On Windows, standard-location scanning includes Windows user locations and attempts to discover WSL distro homes through both UNC namespaces:

```text
\\wsl.localhost\<distro>\home\<wsl-user>
\\wsl$\<distro>\home\<wsl-user>
```

The Windows smoke-test checklist is in `docs/WINDOWS_WSL_SMOKE_TEST.md`.

## Documentation

- `v1_spec.md`: product behavior specification.
- `docs/V1_MODEL.md`: normalized v1 inventory model.
- `docs/PARSER_STRATEGY.md`: safe parser behavior and limits.
- `docs/SCANNER_PERMISSIONS.md`: desktop scanner permission posture.
- `docs/PACKAGING_QUALITY_GATES.md`: latest packaging gate run.
- `docs/WINDOWS_WSL_SMOKE_TEST.md`: Windows build and WSL smoke-test checklist.

## License

MIT
