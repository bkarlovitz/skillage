# V1 Capability Inventory Model

This document defines the normalized v1 inventory language used by Skillage. The model is read-only and source-oriented: every resource should explain which client it belongs to, what kind of capability it is, where it came from, how broadly it applies, what state the scanner can safely claim, and whether content can be previewed.

## Clients

| Client key | Display name | Notes |
| --- | --- | --- |
| `claude-code` | Claude Code | User, project, skill, command, hook, and settings-oriented CLI resources. |
| `claude-desktop` | Claude Desktop | Desktop-level MCP configuration and logs. |
| `codex` | Codex | Layered user, project, system/admin, AgentSkills, plugin, hook, and auth resources. |
| `cursor` | Cursor | Global and project MCP configuration plus project rules. |
| `hermes` | Hermes | Default and named profile environments with skills, MCP, config, auth, logs, and sessions. |
| `openclaw` | OpenClaw | State directories, profiles, included configs, agents, workspaces, skills, MCP, plugins, stores, logs, memory, and migration sources. |

## Resource Types

Resource type is separate from client and scope. A Codex project permission and a Claude Code project permission share the same normalized type, but retain distinct clients and evidence.

| Resource type key | Meaning |
| --- | --- |
| `client-installation` | Evidence that a supported agent client exists, is configured, is partially configured, or is not found. |
| `config-file` | Client configuration file or included configuration file. |
| `mcp-server` | MCP server definition consumed by a client. |
| `skill` | Skill package or skill-like reusable instruction resource. |
| `instruction-file` | Agent instruction, memory, or rules-of-engagement document such as `AGENTS.md` or `CLAUDE.md`. |
| `rule` | Rule file or ruleset, including Cursor MDC rules and client-specific rule formats. |
| `permission` | Tool, command, filesystem, network, or policy permission. |
| `hook` | Lifecycle, command, or event hook. |
| `plugin` | Plugin, extension, bundled add-on, or package-provided capability container. |
| `custom-agent` | Subagent, custom agent, persona, or agent definition file. |
| `profile` | Named profile, alternate state directory, or isolated agent environment. |
| `workspace` | Workspace, project workspace state, or client-local workspace record. |
| `sensitive-store` | Auth file, credential store, token store, secret file, environment file, OS keychain reference, or similar sensitive location. |
| `log-session-store` | Logs, sessions, transcripts, cache traces, memory stores, or conversation/session state. |
| `migration-import-source` | Migration source, imported config, compatibility layer, or source used to ingest settings from another client. |

## Scopes

| Scope key | Meaning |
| --- | --- |
| `global` | Personal configuration that applies broadly across projects. |
| `project-shared` | Configuration stored in a project/repository and likely shared with collaborators. |
| `local-private` | Project-local or machine-local configuration intended to remain private. |
| `profile` | Configuration belonging to a named profile, alternate state directory, or alternate environment. |
| `managed-admin` | Organization, system administrator, MDM, system policy, or requirements-enforced configuration. |
| `plugin-bundled` | Configuration or capabilities provided by installed plugins, bundled resources, or built-in packages. |
| `unknown` | Scope cannot be classified confidently. Unknown is preferable to misleading certainty. |

## Statuses

Status records what the scanner or UI can safely claim. Passive inventory must not claim that an MCP server works unless an explicit user-initiated health check has run.

| Status key | Meaning |
| --- | --- |
| `found` | Resource exists or is configured. |
| `not-found` | Known client or location was checked and not found. |
| `active` | Resource is confidently active. |
| `likely-active` | Resource likely applies, but activation depends on client behavior, trust, profile, or runtime state. |
| `inherited` | Resource comes from a broader scope and may affect the selected project. |
| `disabled` | Resource is configured but disabled. |
| `blocked` | Resource is blocked by trust, policy, permissions, or client state. |
| `shadowed` | Resource is superseded by a more specific resource. |
| `overridden` | Resource is replaced or changed by a higher-precedence layer. |
| `duplicate` | Similar or same-named resource appears in more than one location. |
| `parse-error` | Source existed but could not be parsed. |
| `read-error` | Source existed but could not be read. |
| `sensitive` | Resource is sensitive or points to sensitive material. |
| `needs-review` | Resource may affect trust, secrets, commands, or collaborator exposure. |
| `not-tested` | Resource was inventoried but no runtime/health check has been performed. |
| `unknown` | State cannot be classified confidently. |

## Warnings

Warnings are attached to resources or scan summaries. They are separate from status because a resource can be `found` and still carry several caveats.

| Warning kind | Examples |
| --- | --- |
| Parse/read problems | Unreadable config, unparseable config, unknown file format, missing included file. |
| Scope concerns | Global capability appears project-specific, project capability may be committed, local/private resource may not be visible to collaborators, profile-scoped capability is outside the selected profile. |
| Duplication and conflicts | Same MCP server name appears in multiple clients or scopes, same skill name appears in multiple locations, project resource shadows a global resource, multiple config files define similar resources. |
| Secret/auth concerns | Inline secret-like value, project config contains secret-like value, auth store exists but is not safely inspectable, secret reference points to an environment variable or file. |
| Runtime caveats | MCP server configured but not tested, client may require restart, project resource may be trust-gated, remote gateway mode may hide state, managed/cloud config may hide additional state. |

## Relationships

Relationships explain why a resource appears and how it compares to other resources.

| Relationship kind | Meaning |
| --- | --- |
| `defined-by` | Resource was defined by a source file, directory, profile, or scanner rule. |
| `included-from` | Resource came through an included configuration file. |
| `inherits-from` | Project/profile resource inherits from a broader scope. |
| `overrides` | Resource overrides another resource. |
| `shadowed-by` | Resource is shadowed by another resource. |
| `duplicates` | Resource appears to duplicate another resource. |
| `similar-to` | Resource shares a name or shape but cannot be considered identical. |
| `belongs-to-profile` | Resource belongs to a profile-scoped environment. |
| `belongs-to-workspace` | Resource belongs to a workspace. |
| `provided-by-plugin` | Resource is provided by a plugin or bundled package. |
| `imports-from` | Resource came from a migration/import source. |

### Relationship Evidence Thresholds

Cross-client relationship labels must be source-backed and conservative.

| Label | Minimum evidence |
| --- | --- |
| `identical` | Same resource type and normalized name, plus shared source path or explicit identity key. Shared name alone is never enough. |
| `similar` | Same resource type with similar description or matching launch evidence under different names. |
| `same-name-only` | Same resource type and normalized name, but no stronger evidence. |
| `shadowed` | Explicit precedence evidence such as `shadowed-by`, `shadowed` status, or detector-provided shadow metadata. |
| `overridden` | Explicit `overrides` relationship or `overridden` status. |
| `conflict` | Same client, scope, type, and name with incompatible launch evidence. Shared name alone is never enough. |
| `duplicate` | Same type and name with matching command/package/url launch evidence across separate resources, or an explicit duplicate relationship. |
| `needs-review` | Same-name resources where precedence, activation, or relationship confidence is uncertain. |
| `no-relationship-inferred` | No conservative threshold was met. |

## Source Evidence

Every discovered resource should carry evidence when available.

| Evidence field | Meaning |
| --- | --- |
| `sourcePath` | File, directory, registry location, or virtual location that caused the resource to appear. |
| `sourceLabel` | Human-readable source label when a path is unavailable or insufficient. |
| `scannerRule` | Scanner rule that matched the source. |
| `matchedPathPattern` | Path pattern or convention that matched. |
| `parsedKeyPath` | Parsed key path in a structured source, such as `mcpServers.github.command`. |
| `includedFromPath` | Config path that included this source. |
| `readStatus` | Whether the source was read, unreadable, skipped, or not found. |
| `parseStatus` | Whether the source was parsed, partially parsed, unparseable, skipped, or not applicable. |

## Content Preview Policy

Preview policy controls whether the UI may show source content. It is separate from status and resource type.

| Policy key | Meaning |
| --- | --- |
| `metadata-only` | Show path, size, names, high-level metadata, and safe key names only. Do not show source content. |
| `redacted-preview` | Show a preview only after secret-like values and sensitive fields are redacted. |
| `safe-markdown-preview` | Show markdown or plain text that is not classified as secret, log, session, transcript, cache trace, memory, or auth content. |
| `unread-sensitive` | Do not read contents by default. Show only that the sensitive location exists and why it was skipped. |

Sensitive stores, auth files, logs, sessions, transcripts, cache traces, and memory stores must default to `metadata-only` or `unread-sensitive`. Project files that can execute commands, expose tools, alter permissions, or carry inline secrets should be marked `needs-review` even when a redacted or markdown preview is allowed.
