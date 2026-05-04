use serde::Serialize;
use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

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
struct ContentPreview {
    policy: String,
    raw_preview_allowed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
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
    content_preview: Option<ContentPreview>,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    evidence: Vec<CapabilityEvidence>,
    warnings: Vec<CapabilityWarning>,
    relationships: Vec<CapabilityRelationship>,
    tags: Vec<String>,
    metadata: serde_json::Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ScannerReadPolicy {
    SafeMarkdownPreview,
    RedactedPreview,
    MetadataOnly,
    UnreadSensitive,
}

impl ScannerReadPolicy {
    fn as_preview_policy(self) -> &'static str {
        match self {
            ScannerReadPolicy::SafeMarkdownPreview => "safe-markdown-preview",
            ScannerReadPolicy::RedactedPreview => "redacted-preview",
            ScannerReadPolicy::MetadataOnly => "metadata-only",
            ScannerReadPolicy::UnreadSensitive => "unread-sensitive",
        }
    }

    fn read_status(self) -> &'static str {
        match self {
            ScannerReadPolicy::SafeMarkdownPreview | ScannerReadPolicy::RedactedPreview => "read",
            ScannerReadPolicy::MetadataOnly | ScannerReadPolicy::UnreadSensitive => "skipped",
        }
    }

    fn parse_status(self) -> &'static str {
        match self {
            ScannerReadPolicy::SafeMarkdownPreview | ScannerReadPolicy::RedactedPreview => "not-applicable",
            ScannerReadPolicy::MetadataOnly | ScannerReadPolicy::UnreadSensitive => "skipped",
        }
    }
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

#[derive(Debug, Clone, PartialEq, Eq)]
struct NormalizedPath {
    display_path: String,
    comparable_path: String,
    source_id: String,
}

#[derive(Debug, Clone)]
struct ScopeEvidence {
    scope: String,
    evidence: CapabilityEvidence,
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

#[derive(Debug, Default, Serialize)]
struct ScannerRecords {
    resources: Vec<CapabilityResource>,
    read_errors: Vec<ScanReadError>,
    parse_errors: Vec<ScanParseError>,
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
        || (normalized.contains("/.cursor/") && file_name == "mcp.json")
        || (normalized.contains("/.claude/") && file_name == "mcp.json")
        || (normalized.contains("/.codex/") && file_name == "mcp.json")
        || is_sensitive_store_path(path)
        || is_log_session_store_path(path)
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
    stable_source_id(path)
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

fn wsl_unc_parts(path: &Path) -> Option<Vec<String>> {
    let normalized = normalize_for_match(path);
    let trimmed = normalized.trim_start_matches('/');
    let parts = trimmed
        .split('/')
        .filter(|part| !part.is_empty())
        .map(|part| part.to_string())
        .collect::<Vec<_>>();

    match parts.first().map(|part| part.to_lowercase()) {
        Some(namespace) if namespace == "wsl.localhost" || namespace == "wsl$" => Some(parts),
        _ => None,
    }
}

fn stable_source_id(path: &Path) -> String {
    if let Some(parts) = wsl_unc_parts(path) {
        if parts.len() >= 2 {
            let distro = parts[1].to_lowercase();
            let rest = parts[2..].join("/").to_lowercase();
            return format!("wsl/{distro}/{rest}");
        }
    }

    normalize_for_match(path).to_lowercase()
}

fn normalize_inventory_path(path: &Path) -> NormalizedPath {
    let display_path = path.to_string_lossy().to_string();
    let source_id = stable_source_id(path);
    let comparable_path = if source_id.starts_with("wsl/") {
        format!("wsl://{}", source_id.trim_start_matches("wsl/"))
    } else {
        normalize_for_match(path).to_lowercase()
    };

    NormalizedPath {
        display_path,
        comparable_path,
        source_id,
    }
}

fn dedupe_roots(roots: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    let mut unique = Vec::new();

    for root in roots {
        if seen.insert(stable_source_id(&root)) {
            unique.push(root);
        }
    }

    unique
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

    if is_sensitive_store_path(path) {
        "sensitive-store"
    } else if is_log_session_store_path(path) {
        "log-session-store"
    } else if file_name == "SKILL.md" {
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

fn is_sensitive_store_path(path: &Path) -> bool {
    let normalized = normalize_for_match(path).to_lowercase();
    let file_name = basename(path).to_lowercase();

    file_name == ".env"
        || file_name.starts_with(".env.")
        || file_name.contains("auth")
        || file_name.contains("credential")
        || file_name.contains("secret")
        || file_name.contains("token")
        || file_name.contains("password")
        || file_name.ends_with(".pem")
        || file_name.ends_with(".key")
        || normalized.contains("/credentials/")
        || normalized.contains("/secrets/")
        || normalized.contains("/tokens/")
}

fn is_log_session_store_path(path: &Path) -> bool {
    let normalized = normalize_for_match(path).to_lowercase();
    let file_name = basename(path).to_lowercase();

    normalized.contains("/logs/")
        || normalized.contains("/sessions/")
        || normalized.contains("/transcripts/")
        || normalized.contains("/cache/traces/")
        || normalized.contains("/traces/")
        || normalized.contains("/memory/")
        || file_name.contains("session")
        || file_name.contains("transcript")
        || file_name.contains("trace")
        || file_name == "memory.json"
        || file_name == "memory.md"
}

fn read_policy_for_path(path: &Path) -> ScannerReadPolicy {
    let normalized = normalize_for_match(path).to_lowercase();
    let file_name = basename(path).to_lowercase();

    if file_name.ends_with(".pem") || file_name.ends_with(".key") {
        ScannerReadPolicy::UnreadSensitive
    } else if is_sensitive_store_path(path) || is_log_session_store_path(path) {
        ScannerReadPolicy::MetadataOnly
    } else if file_name.ends_with(".md") || file_name.ends_with(".mdc") || file_name == "skill.md" {
        ScannerReadPolicy::SafeMarkdownPreview
    } else if file_name.ends_with(".json") || file_name.ends_with(".toml") || file_name.ends_with(".yaml") || file_name.ends_with(".yml") || normalized.contains("/.codex/rules/") {
        ScannerReadPolicy::RedactedPreview
    } else {
        ScannerReadPolicy::MetadataOnly
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
    } else if normalized.starts_with("~/")
        || normalized.contains("/.claude/")
        || normalized.contains("/.codex/")
        || normalized.contains("/.agents/")
        || normalized.contains("/.cursor/")
        || normalized.contains("/.hermes/")
        || normalized.contains("/.openclaw/")
    {
        "global"
    } else {
        "project-shared"
    }
}

fn scope_evidence(scope: &str, path: &Path) -> ScopeEvidence {
    ScopeEvidence {
        scope: scope.to_string(),
        evidence: CapabilityEvidence {
            source_path: Some(path.to_string_lossy().to_string()),
            source_label: Some(format!("{scope} scope evidence")),
            scanner_rule: Some(format!("scope:{scope}")),
            matched_path_pattern: Some(normalize_inventory_path(path).comparable_path),
            parsed_key_path: None,
            included_from_path: None,
            read_status: "read".to_string(),
            parse_status: "not-applicable".to_string(),
        },
    }
}

#[cfg(test)]
fn global_scope(path: &Path) -> ScopeEvidence {
    scope_evidence("global", path)
}

#[cfg(test)]
fn project_shared_scope(path: &Path) -> ScopeEvidence {
    scope_evidence("project-shared", path)
}

#[cfg(test)]
fn local_private_scope(path: &Path) -> ScopeEvidence {
    scope_evidence("local-private", path)
}

#[cfg(test)]
fn profile_scope(path: &Path) -> ScopeEvidence {
    scope_evidence("profile", path)
}

#[cfg(test)]
fn managed_admin_scope(path: &Path) -> ScopeEvidence {
    scope_evidence("managed-admin", path)
}

#[cfg(test)]
fn plugin_bundled_scope(path: &Path) -> ScopeEvidence {
    scope_evidence("plugin-bundled", path)
}

#[cfg(test)]
fn unknown_scope(path: &Path) -> ScopeEvidence {
    scope_evidence("unknown", path)
}

fn content_preview_for_policy(policy: ScannerReadPolicy) -> ContentPreview {
    let policy_key = policy.as_preview_policy().to_string();

    match policy {
        ScannerReadPolicy::SafeMarkdownPreview => ContentPreview {
            policy: policy_key,
            raw_preview_allowed: false,
            text: None,
            reason: Some("Safe markdown source detected; preview text is withheld until UI redaction is enabled.".to_string()),
        },
        ScannerReadPolicy::RedactedPreview => ContentPreview {
            policy: policy_key,
            raw_preview_allowed: false,
            text: None,
            reason: Some("Config-like source detected; preview text requires redaction before display.".to_string()),
        },
        ScannerReadPolicy::MetadataOnly => ContentPreview {
            policy: policy_key,
            raw_preview_allowed: false,
            text: None,
            reason: Some("Source is represented by metadata only.".to_string()),
        },
        ScannerReadPolicy::UnreadSensitive => ContentPreview {
            policy: policy_key,
            raw_preview_allowed: false,
            text: None,
            reason: Some("Sensitive source content is not read by default.".to_string()),
        },
    }
}

fn source_evidence(path: &Path, policy: ScannerReadPolicy) -> CapabilityEvidence {
    CapabilityEvidence {
        source_path: Some(path.to_string_lossy().to_string()),
        source_label: None,
        scanner_rule: Some("structured-file-discovery".to_string()),
        matched_path_pattern: Some(basename(path)),
        parsed_key_path: None,
        included_from_path: None,
        read_status: policy.read_status().to_string(),
        parse_status: policy.parse_status().to_string(),
    }
}

fn resource_from_file(path: &Path, size_bytes: u64) -> CapabilityResource {
    let client = client_for_path(path).to_string();
    let resource_type = resource_type_for_path(path).to_string();
    let read_policy = read_policy_for_path(path);
    let scope = scope_for_path(path).to_string();
    let scope_details = scope_evidence(&scope, path);
    let normalized_path = normalize_inventory_path(path);
    let display_path = normalized_path.display_path.clone();
    let name = if basename(path) == "SKILL.md" {
        path.parent()
            .and_then(|parent| parent.file_name())
            .and_then(|name| name.to_str())
            .unwrap_or("skill")
            .to_string()
    } else {
        basename(path)
    };

    let status = if matches!(resource_type.as_str(), "sensitive-store" | "log-session-store") {
        "sensitive"
    } else {
        "found"
    };
    let statuses = if status == "sensitive" {
        vec!["found".to_string(), "sensitive".to_string()]
    } else {
        vec!["found".to_string(), "not-tested".to_string()]
    };

    CapabilityResource {
        id: format!("{client}:{}", stable_id(path)),
        name,
        description: format!("{client} {resource_type} discovered by local scanner."),
        client,
        resource_type: resource_type.clone(),
        scope: scope_details.scope,
        status: status.to_string(),
        statuses,
        preview_policy: Some(read_policy.as_preview_policy().to_string()),
        content_preview: Some(content_preview_for_policy(read_policy)),
        path: Some(display_path),
        evidence: vec![source_evidence(path, read_policy), scope_details.evidence],
        warnings: Vec::new(),
        relationships: Vec::new(),
        tags: vec![resource_type],
        metadata: serde_json::json!({
            "sizeBytes": size_bytes,
            "scannerContract": "structured-v1",
            "readPolicy": read_policy.as_preview_policy(),
            "normalizedPath": normalized_path.comparable_path,
            "sourceId": normalized_path.source_id
        }),
    }
}

fn scanner_warning(id: String, severity: &str, message: String, evidence: CapabilityEvidence) -> ScannerWarning {
    ScannerWarning {
        id,
        severity: severity.to_string(),
        message,
        client: None,
        evidence: Some(evidence),
    }
}

fn warning_from_resource(message: String, severity: &str, evidence: CapabilityEvidence) -> CapabilityWarning {
    CapabilityWarning {
        kind: "parse-read-problem".to_string(),
        severity: severity.to_string(),
        message,
        evidence: Some(evidence),
    }
}

fn mark_resource_with_problem(resource: &mut CapabilityResource, status: &str, message: String, severity: &str) {
    resource.status = status.to_string();
    resource.statuses = vec!["found".to_string(), status.to_string()];
    let evidence = resource
        .evidence
        .first()
        .cloned()
        .unwrap_or_else(|| source_evidence(Path::new(resource.path.as_deref().unwrap_or_default()), ScannerReadPolicy::MetadataOnly));
    resource
        .warnings
        .push(warning_from_resource(message, severity, evidence));
}

fn read_error_record(path: &Path, message: String) -> ScanReadError {
    ScanReadError {
        id: format!("read-error:{}", stable_id(path)),
        client: Some(client_for_path(path).to_string()),
        path: path.to_string_lossy().to_string(),
        message,
        evidence: CapabilityEvidence {
            source_path: Some(path.to_string_lossy().to_string()),
            source_label: None,
            scanner_rule: Some("read-error".to_string()),
            matched_path_pattern: Some(basename(path)),
            parsed_key_path: None,
            included_from_path: None,
            read_status: "unreadable".to_string(),
            parse_status: "skipped".to_string(),
        },
    }
}

fn parse_error_record(path: &Path, message: String) -> ScanParseError {
    ScanParseError {
        id: format!("parse-error:{}", stable_id(path)),
        client: Some(client_for_path(path).to_string()),
        path: path.to_string_lossy().to_string(),
        message,
        evidence: CapabilityEvidence {
            source_path: Some(path.to_string_lossy().to_string()),
            source_label: None,
            scanner_rule: Some("parse-error".to_string()),
            matched_path_pattern: Some(basename(path)),
            parsed_key_path: None,
            included_from_path: None,
            read_status: "read".to_string(),
            parse_status: "parse-error".to_string(),
        },
    }
}

#[cfg(test)]
fn missing_include_warning(included_from: &Path, missing_path: &Path) -> ScannerWarning {
    scanner_warning(
        format!("missing-include:{}", stable_id(missing_path)),
        "warning",
        format!("Included file is missing or unreadable: {}", missing_path.display()),
        CapabilityEvidence {
            source_path: Some(missing_path.to_string_lossy().to_string()),
            source_label: Some("Missing include".to_string()),
            scanner_rule: Some("missing-include".to_string()),
            matched_path_pattern: Some(missing_path.to_string_lossy().to_string()),
            parsed_key_path: None,
            included_from_path: Some(included_from.to_string_lossy().to_string()),
            read_status: "not-found".to_string(),
            parse_status: "skipped".to_string(),
        },
    )
}

fn read_for_policy(path: &Path, policy: ScannerReadPolicy) -> Result<Option<String>, String> {
    match policy {
        ScannerReadPolicy::SafeMarkdownPreview | ScannerReadPolicy::RedactedPreview => {
            fs::read_to_string(path).map(Some).map_err(|error| error.to_string())
        }
        ScannerReadPolicy::MetadataOnly | ScannerReadPolicy::UnreadSensitive => Ok(None),
    }
}

fn validate_parse_if_applicable(path: &Path, content: Option<&str>) -> Result<(), String> {
    let file_name = basename(path).to_lowercase();
    if file_name.ends_with(".json") {
        if let Some(content) = content {
            serde_json::from_str::<serde_json::Value>(content).map_err(|error| error.to_string())?;
        }
    }

    Ok(())
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

    dedupe_roots(roots.into_iter().filter(|root| root.exists() && root.is_dir()).collect())
}

fn scan_existing_root(root: &Path, max_files: usize) -> ScannerRecords {
    let mut records = ScannerRecords::default();
    let walker = WalkDir::new(root)
        .follow_links(false)
        .max_depth(MAX_DEPTH)
        .into_iter()
        .filter_entry(|entry| !entry.file_type().is_dir() || !should_skip_dir(entry.path()));

    for entry in walker {
        if records.resources.len() >= max_files {
            break;
        }

        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                let path = error.path().map(Path::to_path_buf).unwrap_or_else(|| root.to_path_buf());
                let evidence = source_evidence(&path, ScannerReadPolicy::MetadataOnly);
                records.warnings.push(scanner_warning(
                    format!("walk-error:{}", stable_id(&path)),
                    "warning",
                    format!("Failed to inspect {}: {error}", path.display()),
                    evidence,
                ));
                continue;
            }
        };

        if entry.file_type().is_file() && is_interesting(entry.path()) {
            let metadata = match entry.metadata() {
                Ok(metadata) => metadata,
                Err(error) => {
                    let evidence = source_evidence(entry.path(), ScannerReadPolicy::MetadataOnly);
                    records.warnings.push(scanner_warning(
                        format!("stat-error:{}", stable_id(entry.path())),
                        "warning",
                        format!("Failed to stat {}: {error}", entry.path().display()),
                        evidence,
                    ));
                    continue;
                }
            };

            if metadata.len() > MAX_FILE_BYTES {
                let mut resource = resource_from_file(entry.path(), metadata.len());
                mark_resource_with_problem(
                    &mut resource,
                    "needs-review",
                    format!("File exceeds scanner size limit of {MAX_FILE_BYTES} bytes."),
                    "warning",
                );
                records.warnings.push(scanner_warning(
                    format!("oversized:{}", stable_id(entry.path())),
                    "warning",
                    format!("Skipped oversized file {}", entry.path().display()),
                    source_evidence(entry.path(), ScannerReadPolicy::MetadataOnly),
                ));
                records.resources.push(resource);
                continue;
            }

            let mut resource = resource_from_file(entry.path(), metadata.len());
            let policy = read_policy_for_path(entry.path());

            match read_for_policy(entry.path(), policy) {
                Ok(content) => {
                    if let Err(error) = validate_parse_if_applicable(entry.path(), content.as_deref()) {
                        let message = format!("Failed to parse {}: {error}", entry.path().display());
                        mark_resource_with_problem(&mut resource, "parse-error", message.clone(), "error");
                        records.parse_errors.push(parse_error_record(entry.path(), message.clone()));
                        records.warnings.push(scanner_warning(
                            format!("parse-error:{}", stable_id(entry.path())),
                            "error",
                            message,
                            source_evidence(entry.path(), ScannerReadPolicy::RedactedPreview),
                        ));
                    }
                }
                Err(error) => {
                    let message = format!("Failed to read {}: {error}", entry.path().display());
                    mark_resource_with_problem(&mut resource, "read-error", message.clone(), "error");
                    records.read_errors.push(read_error_record(entry.path(), message.clone()));
                    records.warnings.push(scanner_warning(
                        format!("read-error:{}", stable_id(entry.path())),
                        "error",
                        message,
                        source_evidence(entry.path(), ScannerReadPolicy::MetadataOnly),
                    ));
                }
            }

            records.resources.push(resource);
        }
    }

    records
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
    let records = scan_existing_root(&root, MAX_FILES_PER_ROOT);
    summary.resources = records.resources;
    summary.read_errors = records.read_errors;
    summary.parse_errors = records.parse_errors;
    summary.warnings = records.warnings;
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

        let records = scan_existing_root(&root, MAX_FILES_PER_ROOT);
        summary.read_errors.extend(records.read_errors);
        summary.parse_errors.extend(records.parse_errors);
        summary.warnings.extend(records.warnings);

        for file in records.resources {
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
        summary.resources = scan_existing_root(&root, MAX_FILES_PER_ROOT).resources;
        let serialized = serde_json::to_string(&summary).expect("summary serializes");

        assert_eq!(summary.resources.len(), 1);
        assert!(serialized.contains("\"resources\""));
        assert!(serialized.contains("\"scanRoots\""));
        assert!(!serialized.contains("should-not-serialize"));
        assert!(!serialized.contains("\"content\""));

        fs::remove_dir_all(root).expect("remove root");
    }

    #[test]
    fn read_policy_classifies_sensitive_log_and_markdown_paths() {
        assert_eq!(
            read_policy_for_path(&PathBuf::from("/repo/AGENTS.md")),
            ScannerReadPolicy::SafeMarkdownPreview
        );
        assert_eq!(
            read_policy_for_path(&PathBuf::from("/repo/.cursor/mcp.json")),
            ScannerReadPolicy::RedactedPreview
        );
        assert_eq!(
            read_policy_for_path(&PathBuf::from("/repo/.env")),
            ScannerReadPolicy::MetadataOnly
        );
        assert_eq!(
            read_policy_for_path(&PathBuf::from("/home/user/.openclaw/sessions/latest.json")),
            ScannerReadPolicy::MetadataOnly
        );
        assert_eq!(
            read_policy_for_path(&PathBuf::from("/home/user/.ssh/id_rsa.key")),
            ScannerReadPolicy::UnreadSensitive
        );
    }

    #[test]
    fn sensitive_log_and_session_paths_do_not_produce_raw_preview_content() {
        let root = unique_test_dir("read-policy");
        fs::create_dir_all(root.join(".openclaw/sessions")).expect("create session dir");
        fs::create_dir_all(root.join(".codex/cache/traces")).expect("create trace dir");

        fs::write(root.join(".env"), "API_TOKEN=raw-secret-value").expect("write env");
        fs::write(root.join(".openclaw/sessions/latest.json"), "raw conversation log").expect("write session");
        fs::write(root.join(".codex/cache/traces/run.json"), "raw trace").expect("write trace");

        let records = scan_existing_root(&root, MAX_FILES_PER_ROOT);
        let serialized = serde_json::to_string(&records.resources).expect("resources serialize");

        assert_eq!(records.resources.len(), 3);
        assert!(records.resources.iter().all(|resource| resource.preview_policy.as_deref() == Some("metadata-only")));
        assert!(records.resources.iter().all(|resource| resource
            .content_preview
            .as_ref()
            .is_some_and(|preview| preview.text.is_none() && !preview.raw_preview_allowed)));
        assert!(records.resources.iter().any(|resource| resource.resource_type == "sensitive-store"));
        assert!(records.resources.iter().any(|resource| resource.resource_type == "log-session-store"));
        assert!(!serialized.contains("raw-secret-value"));
        assert!(!serialized.contains("raw conversation log"));
        assert!(!serialized.contains("raw trace"));

        fs::remove_dir_all(root).expect("remove root");
    }

    #[test]
    fn invalid_json_config_produces_parse_error_records_without_raw_content() {
        let root = unique_test_dir("parse-error");
        fs::create_dir_all(root.join(".cursor")).expect("create cursor dir");
        fs::write(root.join(".cursor/mcp.json"), "{ invalid json with token: raw-secret }").expect("write invalid json");

        let records = scan_existing_root(&root, MAX_FILES_PER_ROOT);
        let serialized = serde_json::to_string(&records).expect("records serialize");

        assert_eq!(records.resources.len(), 1);
        assert_eq!(records.resources[0].status, "parse-error");
        assert_eq!(records.parse_errors.len(), 1);
        assert!(records.warnings.iter().any(|warning| warning.severity == "error"));
        assert!(!serialized.contains("raw-secret"));

        fs::remove_dir_all(root).expect("remove root");
    }

    #[test]
    fn oversized_files_are_visible_needs_review_records() {
        let root = unique_test_dir("oversized");
        fs::create_dir_all(&root).expect("create root");
        fs::write(root.join("AGENTS.md"), vec![b'a'; MAX_FILE_BYTES as usize + 1]).expect("write oversized file");

        let records = scan_existing_root(&root, MAX_FILES_PER_ROOT);

        assert_eq!(records.resources.len(), 1);
        assert_eq!(records.resources[0].status, "needs-review");
        assert!(records.warnings.iter().any(|warning| warning.id.starts_with("oversized:")));

        fs::remove_dir_all(root).expect("remove root");
    }

    #[test]
    fn simulated_read_and_missing_include_errors_have_user_visible_records() {
        let unreadable = PathBuf::from("/repo/.cursor/mcp.json");
        let read_error = read_error_record(&unreadable, "Permission denied".to_string());
        let missing = missing_include_warning(&PathBuf::from("/repo/openclaw.json"), &PathBuf::from("/repo/missing.json"));

        assert_eq!(read_error.evidence.read_status, "unreadable");
        assert_eq!(read_error.evidence.parse_status, "skipped");
        let evidence = missing.evidence.expect("missing include evidence");
        assert_eq!(evidence.included_from_path.as_deref(), Some("/repo/openclaw.json"));
        assert_eq!(evidence.read_status, "not-found");
    }

    #[test]
    fn stable_source_ids_collapse_wsl_unc_namespaces() {
        let localhost = PathBuf::from(r"\\wsl.localhost\Ubuntu\home\alice\.claude\settings.json");
        let legacy = PathBuf::from(r"\\wsl$\Ubuntu\home\alice\.claude\settings.json");

        assert_eq!(stable_source_id(&localhost), stable_source_id(&legacy));
        assert_eq!(
            stable_source_id(&localhost),
            "wsl/ubuntu/home/alice/.claude/settings.json"
        );
    }

    #[test]
    fn duplicate_wsl_roots_collapse_to_one_logical_root() {
        let roots = vec![
            PathBuf::from(r"\\wsl.localhost\Ubuntu\home\alice\.codex"),
            PathBuf::from(r"\\wsl$\Ubuntu\home\alice\.codex"),
            PathBuf::from(r"\\wsl.localhost\Debian\home\alice\.codex"),
        ];
        let deduped = dedupe_roots(roots);

        assert_eq!(deduped.len(), 2);
        assert_eq!(deduped[0], PathBuf::from(r"\\wsl.localhost\Ubuntu\home\alice\.codex"));
        assert_eq!(deduped[1], PathBuf::from(r"\\wsl.localhost\Debian\home\alice\.codex"));
    }

    #[test]
    fn normalizes_posix_windows_and_wsl_paths_without_losing_display_path() {
        let posix = PathBuf::from("/home/user/repo");
        let windows = PathBuf::from(r"C:\Users\user\repo");
        let wsl_localhost = PathBuf::from(r"\\wsl.localhost\Ubuntu\home\user\repo");
        let wsl_legacy = PathBuf::from(r"\\wsl$\Ubuntu\home\user\repo");

        assert_eq!(normalize_inventory_path(&posix).display_path, "/home/user/repo");
        assert_eq!(normalize_inventory_path(&posix).comparable_path, "/home/user/repo");
        assert_eq!(normalize_inventory_path(&windows).comparable_path, "c:/users/user/repo");
        assert_eq!(normalize_inventory_path(&wsl_localhost).comparable_path, "wsl://ubuntu/home/user/repo");
        assert_eq!(normalize_inventory_path(&wsl_localhost).source_id, normalize_inventory_path(&wsl_legacy).source_id);
    }

    #[test]
    fn scope_primitives_cover_v1_scope_model() {
        let path = PathBuf::from("/repo/AGENTS.md");
        let scopes = [
            global_scope(&path),
            project_shared_scope(&path),
            local_private_scope(&path),
            profile_scope(&path),
            managed_admin_scope(&path),
            plugin_bundled_scope(&path),
            unknown_scope(&path),
        ];

        assert_eq!(
            scopes.iter().map(|scope| scope.scope.as_str()).collect::<Vec<_>>(),
            vec![
                "global",
                "project-shared",
                "local-private",
                "profile",
                "managed-admin",
                "plugin-bundled",
                "unknown"
            ]
        );
        assert!(scopes.iter().all(|scope| scope.evidence.scanner_rule.as_deref().unwrap_or_default().starts_with("scope:")));
    }

    #[test]
    fn scope_detection_keeps_home_repositories_project_shared() {
        assert_eq!(scope_for_path(&PathBuf::from("/home/user/repo/AGENTS.md")), "project-shared");
        assert_eq!(scope_for_path(&PathBuf::from(r"C:\Users\user\repo\AGENTS.md")), "project-shared");
        assert_eq!(
            scope_for_path(&PathBuf::from(r"\\wsl.localhost\Ubuntu\home\user\repo\AGENTS.md")),
            "project-shared"
        );
        assert_eq!(scope_for_path(&PathBuf::from("/home/user/.codex/config.toml")), "global");
        assert_eq!(scope_for_path(&PathBuf::from("/etc/codex/config.toml")), "managed-admin");
    }
}
