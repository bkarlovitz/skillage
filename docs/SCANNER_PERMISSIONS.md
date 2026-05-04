# Scanner Permissions

Skillage scanner access is implemented through narrow Tauri Rust commands:

- `scan_skill_files`
- `scan_standard_skill_files`

The renderer does not receive broad filesystem plugin permissions. `src-tauri/capabilities/default.json` currently grants only `core:default`; no `fs`, `shell`, or dialog plugin permission is required for the Sprint 2 scanner path.

Future folder selection should be documented as a separate UI permission decision. It should not change the scanner internals into broad renderer filesystem access.
