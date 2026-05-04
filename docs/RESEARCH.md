# Skillage Research Notes

## Executive summary

Developers are accumulating many overlapping agent instruction systems: `CLAUDE.md`, `AGENTS.md`, Claude/Hermes-style `SKILL.md` directories, Cursor MDC rules, Windsurf rules, MCP config, and tool-specific global/project settings. The biggest pain is not authoring one prompt; it is knowing which instruction is active, why a tool ignored it, which scope applies, and which files are safe to inspect.

Skillage should be a local-first, open-source desktop app that acts as a read-only capability inventory, explanation layer, and source-path inspector for developer agent ecosystems.

## Primary users

- Developers using several coding agents.
- Skill/rule authors sharing reusable workflows.
- Teams that want repo-local agent conventions without losing personal overrides.

## Core pain points

1. Fragmentation
   - Claude Code, Codex, Hermes, Cursor, Windsurf, MCP, and prompt managers all use different files and activation semantics.
   - Developers duplicate the same instruction in several places.

2. Discoverability
   - Users cannot easily see which rules/skills apply to a repo or file path.
   - Common question: "Why didn't the agent follow my rule?"

3. Format drift
   - `AGENTS.md`, `CLAUDE.md`, `SKILL.md`, Cursor `.mdc`, and other rule formats are close enough to overlap but different enough to drift.

4. Validation gaps
   - Bad YAML/frontmatter, invalid globs, missing descriptions, empty files, stale legacy files, and broken JSON/TOML config can silently fail.

5. Safety/trust
   - Skills may contain scripts, command instructions, env var requirements, or MCP server config.
   - An inventory tool should show risk before any future write workflow and never execute imported scripts during indexing.

6. Git/team workflow
   - Developers need to distinguish committed team rules from local personal rules.
   - Diffs, backups, and safe writes are essential.

## Product wedge

The strongest wedge is:

> Show me which agent capabilities exist on this machine, where they live, what scope they have, and what may affect this repo.

This is more valuable than a generic prompt manager because it solves the messy local filesystem reality developers already have.

## Initial feature recommendation

1. Local inventory scanner
   - Project roots and global locations.
   - Detect `SKILL.md`, `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/*.mdc`, `.cursorrules`, `.hermes/skills`, `.openclaw` placeholders.

2. Normalized asset model
   - name, description, target, kind, scope, path, entry file, body, tags, metadata, validation issues.

3. Validation/linting
   - Required skill frontmatter.
   - Missing descriptions.
   - Legacy Cursor rules.
   - Invalid frontmatter lines.
   - Empty instructions.

4. Effective-context preview, later
   - Select repo + path + target agent.
   - Show applicable instructions and likely precedence.

5. Safe single-target writes, later
   - User-initiated only.
   - Backup + diff before writing to disk.

6. Registry/discovery, later
   - Discovery should come after local inventory is excellent.
   - Show source, license, scripts, env requirements, checksums, and trust decisions.

## Technology recommendation

Use Tauri 2 + Svelte + TypeScript + Rust.

Rationale:
- Tauri keeps the desktop app smaller than Electron.
- Rust backend gives safe native filesystem scanning and future file watching.
- Svelte keeps UI weight low.
- Local-first avoids backend complexity and respects private project data.
- System `git` should be used initially for compatibility with users' SSH agents, credential helpers, LFS, worktrees, and signing.

## Known research caveat

Browser access timed out during research, so source URLs should be verified before publishing claims. Research synthesis was based on known public conventions and should be treated as product discovery notes, not final documentation.

## Sources to verify

- Claude Code docs: https://docs.anthropic.com/en/docs/claude-code
- Claude Code skills: https://docs.anthropic.com/en/docs/claude-code/skills
- OpenAI Codex: https://github.com/openai/codex
- AGENTS.md: https://agents.md/
- Cursor rules: https://docs.cursor.com/context/rules
- Windsurf rules: https://docs.windsurf.com/windsurf/cascade/rules
- MCP: https://modelcontextprotocol.io/
- MCP servers: https://github.com/modelcontextprotocol/servers
- Tauri: https://tauri.app/
- Electron: https://www.electronjs.org/
