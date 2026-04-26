# Skillage MVP Implementation Plan

> For Hermes: Use subagent-driven-development skill to implement future tasks task-by-task.

Goal: Build a lightweight local-first desktop MVP for browsing, validating, and creating developer agent skills/rules.

Architecture: Svelte + TypeScript renders the normalized inventory UI. Core parsers/adapters are pure TypeScript and tested with Vitest. Tauri 2/Rust provides native filesystem scanning and later file watching/safe writes.

Tech Stack: Svelte 5, Vite, TypeScript, Vitest, Tauri 2, Rust, MIT license.

## Task 1: Parser and normalized model

Objective: Represent multiple agent formats in a single typed model.

Files:
- `src/lib/types.ts`
- `src/lib/frontmatter.ts`
- `src/lib/adapters.ts`
- `src/lib/adapters.test.ts`

Verification:
- `npm run test`
- Expected: adapter tests pass.

## Task 2: Inventory UI

Objective: Display detected assets, filters, validation issues, and body preview.

Files:
- `src/App.svelte`
- `src/app.css`
- `src/lib/sampleData.ts`

Verification:
- `npm run check`
- `npm run build`

## Task 3: Tauri backend scaffold

Objective: Provide native desktop source for scanning local repositories.

Files:
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `src-tauri/src/lib.rs`
- `src-tauri/src/main.rs`

Verification:
- On a system with Rust: `npm run tauri:dev`.

## Task 4: Next implementation step

Objective: Wire the frontend to the Tauri `scan_skill_files` command.

Implementation notes:
- Use `@tauri-apps/api/core` `invoke` only when running inside Tauri.
- Use `@tauri-apps/plugin-dialog` or a narrow backend command for folder selection.
- Parse returned virtual files with `parseVirtualFiles`.
- Keep sample data as fallback in browser mode.

## Task 5: Safe writes

Objective: Create/update skills with backup and diff preview.

Implementation notes:
- Never execute scripts while indexing.
- Before modifying a file, create `.bak` or use a Skillage-managed backup directory.
- Prefer atomic writes from Rust.
- Preserve unknown frontmatter fields.
