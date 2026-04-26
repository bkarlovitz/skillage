use serde::Serialize;
use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const MAX_FILES_PER_ROOT: usize = 2_000;
const MAX_TOTAL_FILES: usize = 5_000;
const MAX_FILE_BYTES: u64 = 512 * 1024;
const MAX_DEPTH: usize = 14;

#[derive(Debug, Clone, Serialize)]
struct DiscoveredFile {
    path: String,
    content: String,
}

fn is_interesting(path: &Path) -> bool {
    let file_name = path.file_name().and_then(|name| name.to_str()).unwrap_or_default();
    let normalized = path.to_string_lossy().replace('\\', "/");
    let lower = normalized.to_lowercase();

    file_name == "SKILL.md"
        || file_name == "CLAUDE.md"
        || file_name == "CLAUDE.local.md"
        || file_name == "AGENTS.md"
        || file_name == "AGENTS.override.md"
        || file_name == "SOUL.md"
        || file_name == "TOOLS.md"
        || file_name == "MEMORY.md"
        || file_name == ".cursorrules"
        || file_name == "hooks.json"
        || file_name == "openclaw.json"
        || (file_name == "config.toml" && lower.contains("/.codex/"))
        || (normalized.contains("/.cursor/rules/") && (file_name.ends_with(".mdc") || file_name.ends_with(".md")))
        || (normalized.contains("/.openclaw/") && file_name.ends_with(".md"))
        || (normalized.contains("/.claude/rules/") && file_name.ends_with(".md"))
        || (normalized.contains("/.codex/rules/") && file_name.ends_with(".rules"))
}

fn should_skip_dir(path: &Path) -> bool {
    let name = path.file_name().and_then(|name| name.to_str()).unwrap_or_default();
    matches!(
        name,
        ".git" | "node_modules" | "dist" | "build" | "target" | ".next" | ".svelte-kit" | "vendor"
    )
}

fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("USERPROFILE").map(PathBuf::from))
}

fn expand_root(root: &str) -> PathBuf {
    if let Some(rest) = root.strip_prefix("~/") {
        if let Some(home) = home_dir() {
            return home.join(rest);
        }
    }

    if root == "~" {
        if let Some(home) = home_dir() {
            return home;
        }
    }

    PathBuf::from(root)
}

fn standard_skill_roots_for_home(home: &Path) -> Vec<PathBuf> {
    vec![
        home.join(".claude"),
        home.join(".hermes").join("skills"),
        home.join(".hermes").join("hermes-agent").join("skills"),
        home.join(".hermes").join("hermes-agent").join("optional-skills"),
        home.join(".codex"),
        home.join(".agents"),
        home.join(".openclaw"),
        PathBuf::from("/etc/codex"),
    ]
}

#[cfg(windows)]
fn wsl_standard_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    for namespace in [r"\\wsl.localhost", r"\\wsl$"] {
        let Ok(distros) = fs::read_dir(namespace) else {
            continue;
        };

        for distro in distros.filter_map(Result::ok) {
            let homes_root = distro.path().join("home");
            let Ok(users) = fs::read_dir(homes_root) else {
                continue;
            };

            for user_home in users.filter_map(Result::ok).map(|entry| entry.path()) {
                if user_home.is_dir() {
                    roots.extend(standard_skill_roots_for_home(&user_home));
                }
            }
        }
    }

    roots
}

#[cfg(not(windows))]
fn wsl_standard_roots() -> Vec<PathBuf> {
    Vec::new()
}

fn standard_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Some(home) = home_dir() {
        roots.extend(standard_skill_roots_for_home(&home));
    }

    // If Skillage is run as a Windows desktop app while the user's agent skills live in WSL,
    // include discoverable WSL distro home directories via the Windows UNC namespace.
    roots.extend(wsl_standard_roots());

    if let Ok(current_dir) = env::current_dir() {
        roots.push(current_dir);
    }

    roots
        .into_iter()
        .filter(|root| root.exists() && root.is_dir())
        .fold(Vec::<PathBuf>::new(), |mut unique, root| {
            if !unique.iter().any(|existing| existing == &root) {
                unique.push(root);
            }
            unique
        })
}

fn scan_existing_root(root: &Path, max_files: usize) -> Vec<DiscoveredFile> {
    let mut files = Vec::new();
    let walker = WalkDir::new(root)
        .follow_links(false)
        .max_depth(MAX_DEPTH)
        .into_iter()
        .filter_entry(|entry| !entry.file_type().is_dir() || !should_skip_dir(entry.path()));

    for entry in walker.filter_map(Result::ok) {
        if files.len() >= max_files {
            break;
        }

        if entry.file_type().is_file() && is_interesting(entry.path()) {
            let metadata = match entry.metadata() {
                Ok(metadata) => metadata,
                Err(error) => {
                    eprintln!("failed to stat {}: {error}", entry.path().display());
                    continue;
                }
            };

            if metadata.len() > MAX_FILE_BYTES {
                eprintln!("skipping oversized file {}", entry.path().display());
                continue;
            }

            match fs::read_to_string(entry.path()) {
                Ok(content) => files.push(DiscoveredFile {
                    path: entry.path().to_string_lossy().to_string(),
                    content,
                }),
                Err(error) => eprintln!("failed to read {}: {error}", entry.path().display()),
            }
        }
    }

    files
}

#[tauri::command]
fn scan_skill_files(root: String) -> Result<Vec<DiscoveredFile>, String> {
    let root = expand_root(&root);
    if !root.exists() {
        return Err(format!("Scan root does not exist: {}", root.display()));
    }
    if !root.is_dir() {
        return Err(format!("Scan root must be a directory: {}", root.display()));
    }

    Ok(scan_existing_root(&root, MAX_FILES_PER_ROOT))
}

#[tauri::command]
fn scan_standard_skill_files() -> Result<Vec<DiscoveredFile>, String> {
    let mut seen = HashSet::new();
    let mut discovered = Vec::new();

    for root in standard_roots() {
        if discovered.len() >= MAX_TOTAL_FILES {
            break;
        }

        for file in scan_existing_root(&root, MAX_FILES_PER_ROOT) {
            if discovered.len() >= MAX_TOTAL_FILES {
                break;
            }

            if seen.insert(file.path.clone()) {
                discovered.push(file);
            }
        }
    }

    Ok(discovered)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![scan_skill_files, scan_standard_skill_files])
        .run(tauri::generate_context!())
        .expect("error while running Skillage");
}
