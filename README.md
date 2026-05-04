# Skillage

Local-first capability inventory for developer agent ecosystems.

Skillage is an open-source desktop app for developers who use multiple agents and need one place to inspect what agent capabilities exist on their machine, where they live, what scope they apply to, and which files may affect a selected project. The v1 direction is read-only, privacy-preserving inventory for Claude Code, Claude Desktop, Codex, Cursor, Hermes, and OpenClaw.

## MVP status

This repository currently contains:

- A lightweight Svelte + TypeScript UI.
- A Tauri 2 desktop scaffold.
- Four v1 product surfaces: Machine Inventory, Project Inventory, Clients, and Cross-Client.
- Explicit fixture scenarios for demo and development mode.
- A normalized capability-resource model with source evidence, scope, status, warnings, relationships, and preview policy.
- Parser/adapter code for:
  - Claude/Hermes-style `SKILL.md` directories.
  - Claude `CLAUDE.md` instruction files.
  - Codex `AGENTS.md` instruction files.
  - Cursor `.cursor/rules/*.mdc` files.
- Legacy `.cursorrules` warnings.
  - Conservative OpenClaw markdown placeholders.
- Unit tests for frontmatter parsing, adapters, inventory contracts, fixture scenarios, privacy policies, and table/detail helpers.
- Rust Tauri commands for scanning explicit roots and standard skill locations.

Rust/Tauri prerequisites are installed in this WSL environment, and the Linux desktop build has been verified.

## Run locally

```bash
cd ~/uwchlan/skillage
npm install
npm run test
npm run check
npm run build
npm run dev
```

Then open the local Vite URL printed by the dev server.

## Run as Tauri desktop app

Tauri prerequisites are installed in this WSL environment. Run:

```bash
cd ~/uwchlan/skillage
npm run tauri:dev
```

To create release bundles, run:

```bash
npm run tauri:build
```

Verified Linux bundle outputs are written under `src-tauri/target/release/bundle/`.

The desktop app uses Tauri/Rust commands for local scanning. Standard-location scanning currently checks the app user's home directory for Claude, Hermes, Codex, Cursor, and OpenClaw-style locations that the scanner recognizes. On Windows, it also attempts to discover WSL distro homes through `\\wsl.localhost` / `\\wsl$`, so developers whose agent files live inside Ubuntu WSL can still be indexed by the Windows desktop app when those UNC paths are available.

## Security posture

- Skillage is local-first: no account and no hosted backend are required.
- The scanner treats repository contents as untrusted text.
- The MVP scanner never executes scripts from skills.
- Sensitive stores, auth files, logs, sessions, transcripts, cache traces, and memory stores are represented with metadata-only or unread-sensitive preview policies by default.
- Native scanning is implemented as a narrow Rust command rather than broad renderer filesystem access.
- The Rust scanner skips dependency/build directories, does not follow symlinks, limits scan depth, limits result count, and skips oversized files.
- Future write support is outside the current phase and should use backups, atomic writes, and a diff preview before changing existing global or project files.

## Why local-first?

Agent instructions, MCP config, rules, hooks, permissions, credentials, logs, profiles, and workspace state often contain private project conventions, local paths, tool choices, and sometimes secrets or command hints. The app inventories these files where they already live, without requiring an account or hosted backend.

## License

MIT
