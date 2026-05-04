# Sprint 5: Project Inventory And Effective Project View

## Objective
Demo selecting a project folder and seeing project-scoped resources, inherited global/profile resources, shared/private metadata, trust warnings, and a best-effort effective project view.

## Tasks
- [x] **Task 5.1**: Add project selection flow
  - Add a narrow Tauri backend command or dialog integration for selecting a project folder.
  - Preserve manual path entry or fixture project selection in browser dev mode.
  - Validation: `npm run check` passes and manual Tauri dev selection returns a project path without broad renderer filesystem access.

- [x] **Task 5.2**: Track selected folder versus detected repo root
  - Detect the git repository root for the selected folder when available.
  - Keep selected folder, repo root, and scan root as separate fields in project context.
  - Validation: Tests cover selected repo root, selected subdirectory, non-git folder, and git-unavailable fallback.

- [x] **Task 5.3**: Correct project scope classification
  - Classify resources inside the selected project as project-shared or local-private based on project context and ecosystem conventions, not merely because they live under a user home path.
  - Preserve global classification for resources outside the selected project.
  - Validation: Tests cover `/home/user/repo`, `C:\\Users\\user\\repo`, and WSL UNC project paths.

- [x] **Task 5.4**: Add local/private project resource detection
  - Detect local/private project files where the ecosystem clearly supports that concept, such as local settings files or unshared local overrides.
  - Use unknown instead of overclaiming when the source convention is unclear.
  - Validation: Tests cover local/private positive examples and unknown fallback examples.

- [x] **Task 5.5**: Add git shared/private metadata
  - Classify project files as tracked, ignored, untracked, outside-git, or git-unavailable.
  - Use read-only git commands without writes, hooks, network, or submodule recursion.
  - Validation: Tests or fixture-backed command wrappers cover all five git metadata states and git-missing fallback.

- [x] **Task 5.6**: Scan project resources with the same safe policy as machine scan
  - Detect project-scoped configs, MCP servers, skills, instructions, rules, hooks, permissions, plugins, and local/private resources.
  - Apply the same redaction and metadata-only behavior for sensitive config/log/session files.
  - Validation: Project scanner tests cover project MCP, hook, instruction, secret-like config, and log/session presence.

- [x] **Task 5.7**: Join inherited global/profile resources into project context
  - Show global/profile resources that may affect the selected project while clearly labeling them as inherited.
  - Include caveats where inheritance depends on profile, trust, current working directory, runtime state, or client behavior.
  - Validation: Inheritance tests cover inherited global MCP, profile-scoped Hermes resources, Codex trust-gated project layers, and unknown activation.

- [ ] **Task 5.8**: Add project activation confidence and caveat data
  - Represent found, likely-active, inherited, unknown, needs-review, not-tested, trust-gated, disabled, blocked, shadowed, and overridden as data, not just UI text.
  - Validation: Tests verify project resources are not marked active unless evidence supports it.

- [ ] **Task 5.9**: Add project trust and risk warnings
  - Warn for project MCP servers, hooks, commands, broad permissions, inline secret-like values, executable config, local/private files not visible to collaborators, and shared files likely committed.
  - Validation: Warning tests cover each project risk category.

- [ ] **Task 5.10**: Build the Project Inventory UI
  - Add sections for project resources, inherited global/profile resources, local/private resources, shared-with-collaborators metadata, warnings/caveats, and best-effort effective view.
  - Validation: `npm run check` and `npm run build` pass; fixture demo shows a project with inherited global MCP and a project-scoped warning.

- [ ] **Task 5.11**: Add project inventory empty and error states
  - Show clear states for no project selected, selected folder unavailable, no resources found, read errors, and git unavailable.
  - Validation: UI tests or fixture tests cover each state without falling back to demo data.

- [ ] **Task 5.12**: Preserve Windows/WSL project selection behavior
  - Ensure Windows build project scans work for Windows-native paths and WSL UNC paths.
  - Normalize WSL project paths for identity while preserving original display paths.
  - Validation: Path/project tests cover `\\wsl.localhost` and `\\wsl$` selected project roots.
