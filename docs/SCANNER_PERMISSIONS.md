# Scanner Permissions

Skillage scanner access is implemented through narrow Tauri Rust commands:

- `scan_skill_files`
- `scan_standard_skill_files`
- `select_project_folder`
- `resolve_project_context`

The renderer does not receive broad filesystem plugin permissions. `src-tauri/capabilities/default.json` currently grants only `core:default`; no `fs`, `shell`, or dialog plugin permission is required for the v1 scanner path.

Project path entry and resolution use the same narrow command boundary. Future folder-picker UI should be documented as a separate permission decision and should not change the scanner internals into broad renderer filesystem access.
