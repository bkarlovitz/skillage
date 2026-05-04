# Agent Capability Inventory: Product Spec for Codex

## Purpose

This spec describes the desired product direction for the desktop app. It is intentionally written as a product and behavior specification, not an implementation plan.

The app already has a working v1. The next direction is to make it the clearest possible local inventory and explanation layer for agent-related configuration on a user’s machine.

## Product vision

The app should help users understand what agent capabilities exist on their machine, where they came from, what scope they apply to, and what will likely be active in a selected project.

The user’s core question is:

> What the hell is on my machine, where does it live, and why might my agent be seeing or using it?

The app should become the user’s local “agent capability x-ray.”

It should not try to be an MCP runtime host. It should not prioritize marketplace discovery, installation flows, or config editing before it has excellent inventory, explanation, and scope clarity.

## Initial supported ecosystems

The app should support inventory and explanation for these agent clients/ecosystems:

1. Claude Code
2. Claude Desktop
3. Codex
4. Cursor
5. Hermes
6. OpenClaw

Support means the app can identify relevant local configuration, classify it, display where it lives, explain what it likely affects, and show the relationship between global and project-scoped resources.

## Primary user problem

Users working with multiple agents accumulate config files, MCP servers, skills, instruction files, rules, hooks, credentials, profiles, and project-specific overrides across many tools.

The result is confusing:

- MCP servers appear in one agent but not another.
- Some tools are global and unexpectedly show up everywhere.
- Some project-specific capabilities are hidden inside repo files.
- Some configs are duplicated across multiple agents.
- Some configs are broken or use a subtly different schema than expected.
- Some files contain secrets or references to secrets.
- Users do not know which file to inspect when something appears, disappears, or fails.
- Users cannot easily answer what a selected project’s effective agent environment looks like.

The product should make this understandable.

## Product stance

### The app is an inventory and explanation tool first

The initial experience should be passive, safe, and read-only by default.

The app should inspect what exists and explain it. It should not surprise the user by starting servers, installing packages, editing configs, changing scopes, or reading sensitive logs in depth.

### The app should make scope unavoidable

Every relevant resource should be labeled by scope wherever possible:

- Global
- Project/shared
- Local/private
- Profile-scoped
- Managed/admin
- Plugin/bundled
- Unknown

The app should make it obvious when a capability is inherited from a broader scope into a project.

### The app should preserve user trust

The app will necessarily encounter sensitive files and agent configurations. It should avoid displaying raw secrets, avoid ingesting conversation/session content by default, and clearly distinguish between “found a sensitive store” and “read sensitive contents.”

### The app should explain, not just list

A raw file list is not enough. The app should help users understand what each item means:

- What client owns this?
- What kind of capability is this?
- Is it global or project-scoped?
- Is it active, disabled, blocked, shadowed, duplicated, or unknown?
- What file or directory caused it to exist?
- Is it likely to affect the currently selected project?
- Is there a risk or caveat the user should know about?

## Target users

### Agent power users

These users run multiple coding agents and desktop agents. They want to understand and clean up local complexity.

They are comfortable seeing raw file paths and config snippets, but they do not want to manually remember every client’s conventions.

### Developers using project-scoped agent config

These users work in repos that contain agent instructions, skills, MCP configs, rules, or hooks. They want to know what a repo is adding to their agent environment before trusting or using it.

### Open-source maintainers and tool authors

These users want to see whether their project’s agent setup is discoverable, understandable, and correctly scoped.

### Semi-technical users with agent desktop tools

These users may not understand each config format, but they still need to know why a tool appears in Claude Desktop, Cursor, or another client.

## Core product surfaces

## 1. Machine Inventory View

The Machine Inventory View should answer:

- Which supported agent clients are present or partially configured?
- Which global/profile-level configs exist?
- Which MCP servers are configured globally?
- Which global skills exist?
- Which instruction files, rules, hooks, plugins, agents, and permissions exist?
- Which sensitive stores exist?
- Which configs are broken, unreadable, or suspicious?
- Which resources appear in more than one client?

This view should be useful even when no project is selected.

### Expected contents

The view should group inventory by client and by resource type:

- Clients detected
- Config files
- MCP servers
- Skills
- Instruction files
- Rules / permissions / hooks
- Plugins / extensions / subagents where applicable
- Profiles / workspaces where applicable
- Sensitive stores, redacted
- Logs / sessions, presence only by default
- Errors and warnings

### Required behavior

- Every listed item should show its source path or source location when available.
- Every listed item should show a scope classification when available.
- Every config file should show whether it is readable and parseable.
- Sensitive stores should be represented safely, without exposing raw secret values.
- Session/log stores should be represented cautiously, without reading conversation contents by default.

## 2. Project Inventory View

The Project Inventory View should answer:

- What agent-related config exists inside this project?
- What global capabilities may be inherited into this project?
- What project-specific capabilities may be added by this repo?
- What instruction files may affect agents in this repo?
- What MCP servers, skills, rules, hooks, or plugins are project-scoped?
- What appears duplicated or conflicting between global and project scope?
- Which files are likely shared with collaborators through version control?
- Which project files contain secret-like values or risky config?

### Expected contents

For a selected project, the app should show:

- Project-scoped config files
- Project-scoped MCP servers
- Project-scoped skills
- Project instruction files
- Project rules / hooks / permissions / plugins where applicable
- Global resources inherited into the project
- Local/private resources specific to the project, if the underlying client has that concept
- Effective project view, best effort
- Warnings and caveats

### Required behavior

- The app should not assume that every discovered project file is automatically active. It should show confidence and caveats where activation depends on trust, client behavior, current working directory, profile, or runtime state.
- The app should distinguish between files stored in the project and files inherited from global/profile locations.
- The app should make it obvious when a project file is likely to be committed/shared.

## 3. Client Detail View

Each supported client should have a dedicated detail view.

The detail view should answer:

- Is this client installed, configured, partially configured, or not found?
- What known config locations exist?
- What global config exists?
- What project config exists for the selected project?
- What MCP servers does this client know about?
- What skills or skill-like resources does this client know about?
- What instruction files, rules, hooks, permissions, plugins, or profiles does this client use?
- What sensitive stores exist for this client?
- What caveats apply to this client’s scope and loading behavior?

### Required behavior

- The app should present each client according to that client’s mental model.
- The app should not flatten away important client-specific distinctions.
- The app should still normalize enough information that users can compare similar capabilities across clients.

## 4. Capability Graph / Cross-Client View

The Capability Graph should answer:

- Do I have this same MCP server configured in multiple clients?
- Do I have the same skill or instruction concept in multiple places?
- Which clients know about a given capability?
- Which scopes does a capability occupy?
- Are there duplicate names that may not refer to the same thing?
- Are there project-specific versions shadowing global versions?

### Expected contents

The graph does not need to be visually complex. It can be a normalized list or grouped table.

For each capability, show:

- Name
- Type
- Clients where found
- Scopes where found
- Source locations
- Whether entries look identical, similar, or unrelated despite sharing a name
- Any conflict, duplication, or shadowing notes

### Required behavior

- The app should avoid pretending two items are identical solely because they share a name.
- The app should make duplication useful rather than alarming: sometimes duplication is intentional, sometimes it is accidental.

## Resource types the app should understand

The app should classify these resource types where applicable:

- Agent client installation
- Config file
- MCP server
- Skill
- Instruction file
- Rule
- Permission
- Hook
- Plugin / extension
- Subagent / custom agent
- Profile
- Workspace
- Sensitive store
- Log/session store
- Migration/import source

## Scope model

The app should classify scope with as much precision as the source ecosystem allows.

### Global

Personal configuration that applies broadly across projects.

Examples include global MCP configs, global skills, global instruction files, and user-level agent settings.

### Project/shared

Configuration stored inside a project or repository. It may be shared with collaborators and may affect anyone who opens the project with the relevant agent.

### Local/private

Configuration that applies to a particular project or local context but is intended to remain private to the user/machine.

The app should only label something local/private when the source ecosystem supports that distinction or when the source location clearly implies it.

### Profile-scoped

Configuration belonging to a named profile, alternate state directory, or alternate agent environment.

Profiles should be treated as separate “worlds” unless the client clearly inherits between them.

### Managed/admin

Configuration enforced by an organization, system administrator, MDM, system-level policy, or requirements file.

Managed settings may not be editable or overridable.

### Plugin/bundled

Configuration or skills provided by installed plugins, bundled resources, or built-in packages.

### Unknown

The app should use Unknown when it cannot confidently classify a resource.

Unknown is preferable to misleading certainty.

## Status model

The app should communicate state clearly without overclaiming.

Use states such as:

- Found
- Not found
- Active, when confidently known
- Likely active
- Inherited
- Disabled
- Blocked
- Shadowed
- Overridden
- Duplicate
- Parse error
- Read error
- Sensitive
- Needs review
- Not tested
- Unknown

The app should avoid claiming that an MCP server “works” unless it has been explicitly tested. Passive inventory should produce “configured” or “found,” not “working.”

## Safety and privacy requirements

### Read-only by default

The default scan should not modify files, install packages, start MCP servers, authenticate to services, or alter agent state.

### No runtime hosting

The app should not act as the runtime host for MCP servers as part of this product direction.

### No MCP autostart during inventory

The app should not start MCP server commands during baseline scanning. Health checks may exist later, but must be explicit user actions.

### Secret-safe display

The app should not display raw secret values.

It may show:

- that a secret store exists
- the path or provider of the secret store
- key names when safe
- redacted values
- warnings about inline secrets

It should not show:

- raw API keys
- raw OAuth tokens
- raw bearer tokens
- raw password files
- raw credential file contents

### Session/log caution

The app should treat logs, sessions, transcripts, cache traces, and memory files as potentially sensitive.

By default, it should show presence, location, size, and high-level metadata only. Deep inspection should require explicit user action.

### Project trust awareness

When project-scoped config can execute commands, add skills, expose tools, define hooks, or broaden access, the app should mark it as needing review.

The app does not need to enforce trust like a runtime client, but it should help the user understand trust-relevant risks.

## Client-specific expectations

## Claude Code

The app should identify Claude Code global and project resources, including:

- Global Claude configuration/state
- Global Claude skills
- Project Claude skills
- Project MCP definitions
- Claude instruction files
- Claude commands
- Claude settings, including local/private settings where present

The app should distinguish personal/global Claude resources from project resources.

The app should warn that project-scoped skills and servers may require user approval/trust and may include tool permissions or shell behavior.

## Claude Desktop

The app should identify Claude Desktop MCP configuration and logs where present.

Claude Desktop should generally be treated as global desktop-level MCP configuration, not project-scoped configuration.

The app should make the exact config path highly visible, because wrong-path confusion is a known pain point.

The app should indicate that Claude Desktop may require restart for config changes to take effect, but should not perform restarts.

## Cursor

The app should identify Cursor global and project MCP configuration.

The app should identify Cursor project rules where present.

The app should clearly distinguish Cursor global MCP servers from project MCP servers.

The app should warn when Cursor config appears malformed, because schema mismatch can result in silent failure in the client.

## Codex

The app should identify Codex user, project, and system/admin resources.

The app should represent Codex configuration as layered, with higher-precedence project and user files affecting lower-precedence defaults.

The app should identify Codex MCP servers, AGENTS instruction files, skills, rules, hooks, custom agents, plugins, auth stores, and managed/admin settings where present.

The app should recognize that Codex project layers can be trust-gated. The app should avoid claiming project resources are active when trust state is unknown or untrusted.

The app should recognize Codex skills in AgentSkills-style locations, not only under the Codex home directory.

## Hermes

The app should identify Hermes default profile and named profiles.

Each Hermes profile should be treated as a distinct profile-scoped environment.

The app should identify Hermes MCP servers, Hermes skills, config files, environment files, auth stores, logs, and sessions where present.

The app should show Hermes profile scope clearly so users do not confuse resources from different Hermes profiles.

The app should treat Hermes environment files and auth files as sensitive.

## OpenClaw

The app should identify OpenClaw state directories, profiles, config files, included config files, agents, workspaces, skills, MCP servers, plugins/extensions, sensitive stores, logs, sessions, memory stores, and migration-related sources where present.

The app should understand that OpenClaw configuration may be split across included config files.

The app should understand that OpenClaw may run in a local or remote gateway mode, and that a local desktop app may not own the full runtime state.

The app should distinguish between:

- MCP servers consumed by OpenClaw
- OpenClaw itself exposed as an MCP server to another client

The app should identify skill precedence and shadowing where possible.

The app should treat OpenClaw logs, sessions, credentials, cache traces, token files, and memory files as sensitive.

## Warnings and insights

The app should produce helpful warnings and insights, including:

### Parse/read problems

- Config file cannot be read
- Config file cannot be parsed
- Config file format is not recognized
- Included file is missing or unreadable

### Scope concerns

- Global capability appears project-specific
- Project capability may be committed/shared
- Project capability may execute commands or expose tools
- Local/private capability may not be visible to collaborators
- Profile-scoped capability exists outside the currently selected profile

### Duplication and conflicts

- Same MCP server name appears in multiple clients
- Same MCP server name appears in multiple scopes
- Same skill name appears in multiple locations
- Project capability appears to shadow a global capability
- Multiple config files define similar resources

### Secret/auth concerns

- Inline secret-like value found
- Project config contains secret-like value
- Auth store exists but cannot be inspected safely
- Secret reference points to an environment variable or file

### Runtime caveats

- MCP server is configured but not tested
- Client may require restart to pick up changes
- Project resource may be trust-gated
- Remote gateway/client mode may mean state lives elsewhere
- OS keychain or managed/cloud config may hide additional state

## Acceptance criteria

A Codex agent working on this product direction should consider the work successful when the app can satisfy these user-facing outcomes.

### Machine inventory outcome

Given a user opens the app without selecting a project, they can see:

- which of the six supported ecosystems appear to be present
- where each ecosystem’s relevant global/profile config lives
- which MCP servers are configured globally/profile-wide
- which global/profile skills exist
- which instruction/rule/hook/plugin resources exist globally/profile-wide
- which sensitive stores exist, without exposing raw secrets
- which files could not be read or parsed

### Project inventory outcome

Given a user selects a project folder, they can see:

- project-scoped agent config found in that project
- inherited global/profile resources that may affect the project
- project skills and instruction files
- project MCP servers
- project rules/hooks/plugins where applicable
- files that are likely shared with collaborators
- warnings about secrets, command execution, broad tools, or trust-sensitive resources
- a best-effort effective view of what may apply in that project

### Cross-client understanding outcome

Given a user has similar capabilities configured in multiple clients, they can see:

- where each instance exists
- which client owns each instance
- which scope each instance has
- whether the app believes they are duplicates, related, or merely similarly named

### Source-path clarity outcome

For every discovered resource where a source can be known, the user can see the path or source location that caused it to appear.

### Safety outcome

During normal inventory, the app does not:

- modify config files
- install packages
- start MCP servers
- authenticate to external services
- reveal raw secrets
- ingest logs or sessions deeply without explicit opt-in

## Non-goals for this phase

The following are out of scope for this product direction unless explicitly requested later:

- Becoming an MCP runtime host
- Automatically starting MCP servers during scanning
- Installing MCP servers or skills
- Editing multiple clients’ configs at once
- Marketplace publishing
- Hosted registry accounts
- Ratings/reviews/social discovery
- Cross-machine sync
- Enterprise policy management UI
- Automatic cleanup or deduplication
- Automatic trust decisions
- Deep session/transcript analysis by default

## Future direction after inventory is excellent

Once the app is excellent at explaining what exists, future product layers can include:

1. Explicit health checks
   - User-initiated only
   - Verify whether configured MCP servers can start or respond
   - Show results separately from passive inventory

2. Safe single-target edits
   - Edit one selected target config at a time
   - Show diff and target path before writing
   - Backup before writing
   - Never “install everywhere” by default

3. Scope migration
   - Help users move capabilities between global and project scope
   - Warn about secrets and version control
   - Preserve source clarity

4. Registry/discovery
   - Add MCP and skill discovery after local inventory is strong
   - Install should always require scope choice and config review

5. Trust review workflows
   - Help users review project agent config before using a repo
   - Show command, file, network, secret, and tool risks clearly

## Product quality bar

The app should feel like opening a clear map of the local agent ecosystem.

A user should leave the app thinking:

- “I finally know what agent configs are on this machine.”
- “I know which ones are global and which ones belong to this project.”
- “I know where this MCP server is coming from.”
- “I can tell when two agents have separate copies of the same capability.”
- “I can see risky files without the app leaking secrets.”
- “I trust this app because it explains before it acts.”

## One-sentence direction for Codex

Improve the existing v1 into a read-only, scope-aware, privacy-preserving inventory and explanation experience for Claude Code, Claude Desktop, Codex, Cursor, Hermes, and OpenClaw, with source-path clarity, project/global distinction, cross-client capability grouping, and explicit caveats wherever activation or runtime state is uncertain.
