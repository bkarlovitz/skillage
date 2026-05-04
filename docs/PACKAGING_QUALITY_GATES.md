# Packaging Quality Gates

Last run: 2026-05-04T11:31:20-04:00

Environment:

- OS: Linux bryan-pc 5.15.167.4-microsoft-standard-WSL2 x86_64
- Node.js: v22.16.0
- npm: 11.4.2
- Rust: rustc 1.95.0, cargo 1.95.0
- Tauri CLI: tauri-cli 2.10.1

## Results

| Command | Result | Notes |
| --- | --- | --- |
| `npm run test` | Pass | 54 test files, 287 tests passed. |
| `cargo test` | Pass | 21 Rust tests passed in `src-tauri`; no doc tests. |
| `npm run check` | Pass | `svelte-check` found 0 errors and 0 warnings; `tsc -p tsconfig.node.json` passed. |
| `npm run build` | Pass | Vite production build completed; output written to `dist/`. |
| `npm run tauri:build` | Pass | Built the release binary and Linux bundles in this WSL2 environment. |

## Bundle Outputs

The successful `npm run tauri:build` run created:

- `src-tauri/target/release/bundle/deb/Skillage_0.1.0_amd64.deb`
- `src-tauri/target/release/bundle/rpm/Skillage-0.1.0-1.x86_64.rpm`
- `src-tauri/target/release/bundle/appimage/Skillage_0.1.0_amd64.AppImage`

## Environment Limits

This gate pass verifies Linux packaging from WSL2. It does not prove a native Windows installer because this environment is not a Windows desktop packaging host. The native Windows build and WSL smoke test must be run on Windows with `docs/WINDOWS_WSL_SMOKE_TEST.md` before a Windows release.
