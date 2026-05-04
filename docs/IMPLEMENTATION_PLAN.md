# Skillage V1 Implementation Notes

This document describes the current v1 implementation. The product behavior target lives in `v1_spec.md`; the normalized data language lives in `docs/V1_MODEL.md`.

## Current Goal

Skillage v1 is a lightweight local-first desktop inventory for developer agent capabilities. It answers:

- What supported agent resources exist on this machine?
- Where did each resource come from?
- What scope does it appear to have?
- What may affect a selected project?
- Which resources need review because of secrets, logs, parse/read problems, duplication, scope caveats, or runtime uncertainty?

V1 is read-only. It does not author skills, edit config, publish resources, install packages, host MCP servers, authenticate to services, or sync data across machines.

## Architecture

- Svelte 5 + TypeScript render the inventory UI.
- Pure TypeScript modules define parsing, fixture scenarios, table/detail models, project analysis, cross-client grouping, and safe preview policy.
- Tauri 2 + Rust provide narrow native commands for desktop scanning and project path resolution.
- Vitest covers model contracts, parsers, scanner behavior, fixtures, acceptance cases, privacy, project context, source-path clarity, and documentation guardrails.

## Product Surfaces

- `Machine Inventory`: local machine and known client resources grouped by supported client, with scan roots, known locations, scanner records, filters, source paths, preview policy, and warnings.
- `Project Inventory`: selected project context, project-shared resources, inherited global/profile resources, local/private resources, shared metadata, warnings/caveats, and best-effort effective resources.
- `Clients`: supported-client coverage cards and client detail views with install/config state, known locations, evidence rows, client-specific sections, explanations, and caveats.
- `Cross-Client`: conservative grouping by capability name and type, with relationship labels and source locations.

## Supported Clients

V1 inventory covers Claude Code, Claude Desktop, Codex, Cursor, Hermes, and OpenClaw. Client support means local discovery, classification, source evidence, scope/status labeling, and safe display. It does not mean runtime health checks or client-managed activation guarantees.

## Scanner Integration

The frontend uses `@tauri-apps/api/core` `invoke` only in Tauri mode:

- `scan_skill_files`
- `scan_standard_skill_files`
- `select_project_folder`
- `resolve_project_context`

Browser dev mode keeps fixture/demo data and the local Vite scanner bridge separate from desktop scan results.

## Safety Rules

- Never execute scripts, hooks, MCP commands, or package-manager commands during inventory.
- Never follow symlinks during scanner traversal.
- Skip dependency/build directories.
- Bound scan depth, file size, per-root results, and total results.
- Treat auth, credential, token, secret, log, session, transcript, cache trace, and memory paths as metadata-only or unread-sensitive by default.
- Redact secret-like inline values before any redacted config preview.
- Preserve source paths or explicit unknown-source labels in user-facing detail.

## Validation

The standard gates are:

```bash
npm run test
cargo test --manifest-path src-tauri/Cargo.toml
npm run check
npm run build
npm run tauri:build
```

Environment-specific packaging results are captured in `docs/PACKAGING_QUALITY_GATES.md`.

## Future Work Boundaries

Future write support, marketplace discovery, install flows, publishing, hosted accounts, and cross-machine sync are outside v1. Any future write workflow should be explicit, single-target, backed up, and diff-previewed before changing global or project files.
