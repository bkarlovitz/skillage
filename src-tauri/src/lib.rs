use serde::Serialize;
use std::collections::HashSet;
use std::env;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

#[cfg(any(test, windows))]
use std::fs;

const MAX_FILES_PER_ROOT: usize = 2_000;
const MAX_TOTAL_FILES: usize = 5_000;
const MAX_FILE_BYTES: u64 = 512 * 1024;
const MAX_DEPTH: usize = 14;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CapabilityEvidence {
    source_path: Option<String>,
    source_label: Option<String>,
    scanner_rule: Option<String>,
    matched_path_pattern: Option<String>,
    parsed_key_path: Option<String>,
    included_from_path: Option<String>,
    read_status: String,
    parse_status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CapabilityWarning {
    kind: String,
    severity: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    evidence: Option<CapabilityEvidence>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CapabilityRelationship {
    kind: String,
    target_resource_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    evidence: Option<CapabilityEvidence>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CapabilityResource {
    id: String,
    name: String,
    description: String,
    client: String,
    resource_type: String,
    scope: String,
    status: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    statuses: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    preview_policy: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    evidence: Vec<CapabilityEvidence>,
    warnings: Vec<CapabilityWarning>,
    relationships: Vec<CapabilityRelationship>,
    tags: Vec<String>,
    metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanRoot {
    path: String,
    label: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    client: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    scope: Option<String>,
    evidence: CapabilityEvidence,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct KnownClientLocation {
    client: String,
    label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    exists: bool,
    scope: String,
    resource_type: String,
    evidence: CapabilityEvidence,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanReadError {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    client: Option<String>,
    path: String,
    message: String,
    evidence: CapabilityEvidence,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanParseError {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    client: Option<String>,
    path: String,
    message: String,
    evidence: CapabilityEvidence,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SkippedSensitiveStore {
    id: String,
    client: String,
    resource_type: String,
    scope: String,
    path: String,
    reason: String,
    evidence: CapabilityEvidence,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScannerWarning {
    id: String,
    severity: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    client: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    evidence: Option<CapabilityEvidence>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanSummary {
    id: String,
    generated_at: String,
    data_source: String,
    resources: Vec<CapabilityResource>,
    known_client_locations: Vec<KnownClientLocation>,
    scan_roots: Vec<ScanRoot>,
    read_errors: Vec<ScanReadError>,
    parse_errors: Vec<ScanParseError>,
    skipped_sensitive_stores: Vec<SkippedSensitiveStore>,
    warnings: Vec<ScannerWarning>,
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

fn generated_at() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    format!("unix:{seconds}")
}

fn normalize_for_match(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn basename(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("unknown")
        .to_string()
}

fn stable_id(path: &Path) -> String {
    normalize_for_match(path)
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, ':' | '_' | '.' | '/' | '-') {
                ch
            } else {
                '-'
            }
        })
        .collect()
}

fn client_for_path(path: &Path) -> &'static str {
    let normalized = normalize_for_match(path).to_lowercase();
    let file_name = basename(path).to_lowercase();

    if normalized.contains("/.claude/") || file_name == "claude.md" || file_name == "claude.local.md" {
        "claude-code"
    } else if normalized.contains("claude_desktop_config.json") {
        "claude-desktop"
    } else if normalized.contains("/.cursor/") || file_name == ".cursorrules" {
        "cursor"
    } else if normalized.contains("/.hermes/") {
        "hermes"
    } else if normalized.contains("/.openclaw/") {
        "openclaw"
    } else {
        "codex"
    }
}

fn resource_type_for_path(path: &Path) -> &'static str {
    let normalized = normalize_for_match(path).to_lowercase();
    let file_name = basename(path);

    if file_name == "SKILL.md" {
        "skill"
    } else if file_name == "hooks.json" {
        "hook"
    } else if file_name == ".cursorrules" || normalized.contains("/.cursor/rules/") || normalized.contains("/.codex/rules/") || normalized.contains("/.claude/rules/") {
        "rule"
    } else if matches!(
        file_name.as_str(),
        "CLAUDE.md" | "CLAUDE.local.md" | "AGENTS.md" | "AGENTS.override.md" | "SOUL.md" | "TOOLS.md" | "MEMORY.md"
    ) || (normalized.contains("/.openclaw/") && file_name.ends_with(".md"))
    {
        "instruction-file"
    } else {
        "config-file"
    }
}

fn scope_for_path(path: &Path) -> &'static str {
    let normalized = normalize_for_match(path).to_lowercase();

    if normalized.starts_with("/etc/") {
        "managed-admin"
    } else if normalized.contains("/profiles/") {
        "profile"
    } else if normalized.contains("/plugins/") || normalized.contains("/cache/") || normalized.contains("/.tmp/") {
        "plugin-bundled"
    } else if normalized.contains("/.local/") || normalized.ends_with(".local.json") || normalized.ends_with(".local.md") {
        "local-private"
    } else if normalized.contains("/home/") || normalized.contains("/users/") || normalized.starts_with("~/") {
        "global"
    } else {
        "project-shared"
    }
}

fn preview_policy_for_resource(resource_type: &str) -> &'static str {
    match resource_type {
        "instruction-file" | "skill" | "rule" => "metadata-only",
        _ => "metadata-only",
    }
}

fn source_evidence(path: &Path, read_status: &str, parse_status: &str) -> CapabilityEvidence {
    CapabilityEvidence {
        source_path: Some(path.to_string_lossy().to_string()),
        source_label: None,
        scanner_rule: Some("structured-file-discovery".to_string()),
        matched_path_pattern: Some(basename(path)),
        parsed_key_path: None,
        included_from_path: None,
        read_status: read_status.to_string(),
        parse_status: parse_status.to_string(),
    }
}

fn resource_from_file(path: &Path, size_bytes: u64) -> CapabilityResource {
    let client = client_for_path(path).to_string();
    let resource_type = resource_type_for_path(path).to_string();
    let scope = scope_for_path(path).to_string();
    let display_path = path.to_string_lossy().to_string();
    let name = if basename(path) == "SKILL.md" {
        path.parent()
            .and_then(|parent| parent.file_name())
            .and_then(|name| name.to_str())
            .unwrap_or("skill")
            .to_string()
    } else {
        basename(path)
    };

    CapabilityResource {
        id: format!("{client}:{}", stable_id(path)),
        name,
        description: format!("{client} {resource_type} discovered by local scanner."),
        client,
        resource_type: resource_type.clone(),
        scope,
        status: "found".to_string(),
        statuses: vec!["found".to_string(), "not-tested".to_string()],
        preview_policy: Some(preview_policy_for_resource(&resource_type).to_string()),
        path: Some(display_path),
        evidence: vec![source_evidence(path, "read", "not-applicable")],
        warnings: Vec::new(),
        relationships: Vec::new(),
        tags: vec![resource_type],
        metadata: serde_json::json!({
            "sizeBytes": size_bytes,
            "scannerContract": "structured-v1"
        }),
    }
}

fn scan_root_record(root: &Path, label: &str, status: &str) -> ScanRoot {
    ScanRoot {
        path: root.to_string_lossy().to_string(),
        label: label.to_string(),
        status: status.to_string(),
        client: None,
        scope: None,
        evidence: CapabilityEvidence {
            source_path: Some(root.to_string_lossy().to_string()),
            source_label: Some(label.to_string()),
            scanner_rule: Some("scan-root".to_string()),
            matched_path_pattern: Some(root.to_string_lossy().to_string()),
            parsed_key_path: None,
            included_from_path: None,
            read_status: if status == "scanned" { "read" } else { "not-found" }.to_string(),
            parse_status: "not-applicable".to_string(),
        },
    }
}

fn empty_scan_summary(id: &str) -> ScanSummary {
    ScanSummary {
        id: id.to_string(),
        generated_at: generated_at(),
        data_source: "local-scan".to_string(),
        resources: Vec::new(),
        known_client_locations: Vec::new(),
        scan_roots: Vec::new(),
        read_errors: Vec::new(),
        parse_errors: Vec::new(),
        skipped_sensitive_stores: Vec::new(),
        warnings: Vec::new(),
    }
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

fn scan_existing_root(root: &Path, max_files: usize) -> Vec<CapabilityResource> {
    let mut resources = Vec::new();
    let walker = WalkDir::new(root)
        .follow_links(false)
        .max_depth(MAX_DEPTH)
        .into_iter()
        .filter_entry(|entry| !entry.file_type().is_dir() || !should_skip_dir(entry.path()));

    for entry in walker.filter_map(Result::ok) {
        if resources.len() >= max_files {
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

            resources.push(resource_from_file(entry.path(), metadata.len()));
        }
    }

    resources
}

#[tauri::command]
fn scan_skill_files(root: String) -> Result<ScanSummary, String> {
    let root = expand_root(&root);
    if !root.exists() {
        return Err(format!("Scan root does not exist: {}", root.display()));
    }
    if !root.is_dir() {
        return Err(format!("Scan root must be a directory: {}", root.display()));
    }

    let mut summary = empty_scan_summary("local-root-scan");
    summary.scan_roots.push(scan_root_record(&root, "Selected scan root", "scanned"));
    summary.resources = scan_existing_root(&root, MAX_FILES_PER_ROOT);
    Ok(summary)
}

#[tauri::command]
fn scan_standard_skill_files() -> Result<ScanSummary, String> {
    let mut seen = HashSet::new();
    let mut summary = empty_scan_summary("local-standard-scan");

    for root in standard_roots() {
        if summary.resources.len() >= MAX_TOTAL_FILES {
            break;
        }

        summary.scan_roots.push(scan_root_record(&root, "Standard local location", "scanned"));

        for file in scan_existing_root(&root, MAX_FILES_PER_ROOT) {
            if summary.resources.len() >= MAX_TOTAL_FILES {
                break;
            }

            if let Some(path) = &file.path {
                if seen.insert(path.clone()) {
                    summary.resources.push(file);
                }
            }
        }
    }

    Ok(summary)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![scan_skill_files, scan_standard_skill_files])
        .run(tauri::generate_context!())
        .expect("error while running Skillage");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn unique_test_dir(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();
        env::temp_dir().join(format!("skillage-{name}-{suffix}"))
    }

    #[test]
    fn structured_resource_serialization_omits_raw_content() {
        let path = PathBuf::from("/home/test/repo/AGENTS.md");
        let resource = resource_from_file(&path, 42);
        let serialized = serde_json::to_string(&resource).expect("resource serializes");

        assert!(serialized.contains("\"resourceType\":\"instruction-file\""));
        assert!(serialized.contains("\"sourcePath\":\"/home/test/repo/AGENTS.md\""));
        assert!(serialized.contains("\"sizeBytes\":42"));
        assert!(!serialized.contains("\"content\""));
    }

    #[test]
    fn scan_summary_serialization_returns_resources_without_file_bodies() {
        let root = unique_test_dir("structured-scan");
        fs::create_dir_all(&root).expect("create root");
        let agents = root.join("AGENTS.md");
        let mut file = fs::File::create(&agents).expect("create AGENTS.md");
        writeln!(file, "# Agent Instructions\nTOKEN=should-not-serialize").expect("write test file");

        let mut summary = empty_scan_summary("test-scan");
        summary.scan_roots.push(scan_root_record(&root, "Test root", "scanned"));
        summary.resources = scan_existing_root(&root, MAX_FILES_PER_ROOT);
        let serialized = serde_json::to_string(&summary).expect("summary serializes");

        assert_eq!(summary.resources.len(), 1);
        assert!(serialized.contains("\"resources\""));
        assert!(serialized.contains("\"scanRoots\""));
        assert!(!serialized.contains("should-not-serialize"));
        assert!(!serialized.contains("\"content\""));

        fs::remove_dir_all(root).expect("remove root");
    }
}
