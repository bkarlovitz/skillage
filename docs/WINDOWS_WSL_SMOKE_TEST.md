# Windows Build And WSL Smoke-Test Checklist

Use this checklist on a Windows machine that has Node.js, Rust, the Tauri prerequisites, and at least one WSL distro installed. The goal is to prove the Windows desktop build scans Windows user locations and WSL homes on the same machine without leaking raw secret, log, or session content.

## Build Gate

Run these commands from PowerShell in the repository root:

```powershell
npm ci
npm run test -- src/lib/inventory/locations.test.ts src/lib/inventory/project/context.test.ts src/lib/inventory/project/scope.test.ts
npm run check
npm run build
npm run tauri:build
```

Expected result: every command exits successfully and the Windows bundle is written under `src-tauri\target\release\bundle\`.

## Local Smoke Data

Prepare Windows-native capability files under `%USERPROFILE%`:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\skills\smoke-review"
Set-Content "$env:USERPROFILE\.claude\skills\smoke-review\SKILL.md" "# smoke-review`nReview local Windows projects."
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex"
Set-Content "$env:USERPROFILE\.codex\AGENTS.md" "# Windows Codex instructions`nUse local repo conventions."
```

Prepare WSL capability files and sensitive/log fixtures:

```powershell
wsl.exe -l -q
wsl.exe -- bash -lc "mkdir -p ~/.claude/skills/wsl-review ~/.codex ~/.cursor/rules ~/.hermes/logs ~/.openclaw && printf '# wsl-review\nReview WSL projects.\n' > ~/.claude/skills/wsl-review/SKILL.md && printf '# WSL Codex instructions\nUse WSL repo conventions.\n' > ~/.codex/AGENTS.md && printf 'TOKEN=sk-smoke-secret-value\n' > ~/.codex/.env && printf 'session_token=raw-session-secret\n' > ~/.hermes/logs/session.log"
```

Expected result: File Explorer can open both UNC namespaces for the distro home:

```text
\\wsl.localhost\<distro>\home\<wsl-user>
\\wsl$\<distro>\home\<wsl-user>
```

## Desktop Smoke Pass

Start the Windows desktop app:

```powershell
npm run tauri:dev
```

Then complete these UI checks:

- In `Machine Inventory`, select `Scan standard locations`.
- Expected: `Scan roots` includes Windows user roots and WSL home roots for the detected distro.
- Expected: `Known locations` shows found Windows-native rows for `.claude` or `.codex`.
- Expected: `Known locations` shows found WSL rows for `\\wsl.localhost\<distro>\home\<wsl-user>` or `\\wsl$\<distro>\home\<wsl-user>`.
- Expected: duplicate WSL namespace paths collapse to one logical row per client location. The same `.codex` or `.claude` home should not appear twice only because both `\\wsl.localhost` and `\\wsl$` resolve.
- Expected: the inventory table `Path` column preserves the source path that was scanned, and detail views show `Path` or `unknown source`.
- Expected: WSL skill and instruction resources are visible under the correct client cards, with scopes and status filled in.
- Expected: sensitive and log/session fixtures appear only as `unread-sensitive` or `metadata-only`; raw values such as `sk-smoke-secret-value` and `raw-session-secret` are not visible in the inventory table, client detail, or `Safe Detail Panels`.

## Explicit UNC Smoke Pass

Run an explicit scan for each namespace from `Machine Inventory` by opening `Advanced scan` and using `Scan root`.

```text
\\wsl.localhost\<distro>\home\<wsl-user>
\\wsl$\<distro>\home\<wsl-user>
```

Expected result: both scans find the same WSL resources, stable identity treats the two namespace paths as the same WSL home, and the UI still displays safe source paths without raw secret/log/session body text.

## Project Selection Smoke Pass

Use `Project Inventory` with a WSL project path:

```text
\\wsl.localhost\<distro>\home\<wsl-user>\<project>
```

Then repeat with:

```text
\\wsl$\<distro>\home\<wsl-user>\<project>
```

Expected result: the `Selection` panel shows the selected path and scan root, project resources remain stable across both UNC namespace forms, and inherited global/profile rows from the WSL home remain visible where applicable.
