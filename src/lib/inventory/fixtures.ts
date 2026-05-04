import { createEmptyScanSummary, type KnownClientLocation, type ScanSummary } from './scan';
import type { CapabilityClient, CapabilityEvidence, CapabilityResource, CapabilityResourceType, CapabilityScope, CapabilityStatus, ContentPreviewPolicy } from './types';
import { defaultPreviewPolicy } from './preview';

export type InventoryFixtureScenarioId =
  | 'empty-machine'
  | 'full-machine'
  | 'project-inherited-globals'
  | 'duplicate-mcp-names'
  | 'secret-warning'
  | 'parse-read-error'
  | 'not-found-clients'
  | 'large-inventory';

export interface InventoryFixtureScenario {
  id: InventoryFixtureScenarioId;
  label: string;
  description: string;
  summary: ScanSummary;
}

const generatedAt = '2026-01-01T00:00:00.000Z';

function evidence(sourcePath: string, scannerRule: string, matchedPathPattern: string, parsedKeyPath?: string): CapabilityEvidence {
  return {
    sourcePath,
    scannerRule,
    matchedPathPattern,
    parsedKeyPath,
    readStatus: 'read',
    parseStatus: parsedKeyPath ? 'parsed' : 'not-applicable'
  };
}

function resource(input: {
  id: string;
  name: string;
  description: string;
  client: CapabilityClient;
  resourceType: CapabilityResourceType;
  scope: CapabilityScope;
  status?: CapabilityStatus;
  statuses?: CapabilityStatus[];
  path?: string;
  evidence: CapabilityEvidence[];
  previewPolicy?: ContentPreviewPolicy;
  warnings?: CapabilityResource['warnings'];
  relationships?: CapabilityResource['relationships'];
  tags?: string[];
  metadata?: CapabilityResource['metadata'];
}): CapabilityResource {
  return {
    status: input.status ?? 'found',
    statuses: input.statuses,
    path: input.path,
    previewPolicy: input.previewPolicy ?? defaultPreviewPolicy({ resourceType: input.resourceType, path: input.path, name: input.name }),
    warnings: input.warnings ?? [],
    relationships: input.relationships ?? [],
    tags: input.tags ?? [],
    metadata: input.metadata ?? {},
    id: input.id,
    name: input.name,
    description: input.description,
    client: input.client,
    resourceType: input.resourceType,
    scope: input.scope,
    evidence: input.evidence
  };
}

function knownLocation(client: CapabilityClient, label: string, path: string, exists: boolean, scope: CapabilityScope = 'global'): KnownClientLocation {
  return {
    client,
    label,
    path,
    exists,
    scope,
    resourceType: 'config-file',
    evidence: {
      sourcePath: path,
      scannerRule: `${client}-known-location`,
      matchedPathPattern: path,
      readStatus: exists ? 'read' : 'not-found',
      parseStatus: exists ? 'parsed' : 'not-applicable'
    }
  };
}

const clientLocations = [
  knownLocation('claude-code', 'Claude Code home', '~/.claude', true),
  knownLocation('claude-desktop', 'Claude Desktop config', '~/Library/Application Support/Claude/claude_desktop_config.json', true),
  knownLocation('codex', 'Codex home', '~/.codex', true),
  knownLocation('cursor', 'Cursor user config', '~/.cursor', true),
  knownLocation('hermes', 'Hermes profile root', '~/.hermes', true, 'profile'),
  knownLocation('openclaw', 'OpenClaw state root', '~/.openclaw', true)
];

const notFoundLocations = clientLocations.map((location) => ({
  ...location,
  exists: false,
  evidence: {
    ...location.evidence,
    readStatus: 'not-found' as const,
    parseStatus: 'not-applicable' as const
  }
}));

const fullMachineResources = [
  resource({
    id: 'full-claude-code-installation',
    name: 'Claude Code',
    description: 'Claude Code user configuration is present.',
    client: 'claude-code',
    resourceType: 'client-installation',
    scope: 'global',
    evidence: [evidence('~/.claude', 'claude-code-home', '~/.claude')]
  }),
  resource({
    id: 'full-claude-code-project-mcp',
    name: 'filesystem',
    description: 'Claude Code project MCP server definition.',
    client: 'claude-code',
    resourceType: 'mcp-server',
    scope: 'project-shared',
    status: 'needs-review',
    statuses: ['found', 'not-tested', 'needs-review'],
    path: '/repo/.claude/mcp.json',
    evidence: [evidence('/repo/.claude/mcp.json', 'claude-code-mcp', '.claude/mcp.json', 'mcpServers.filesystem')],
    warnings: [{ kind: 'scope-concern', severity: 'warning', message: 'Project-scoped Claude Code MCP activation depends on project trust and needs review.' }],
    tags: ['mcp'],
    metadata: { trustGated: true }
  }),
  resource({
    id: 'full-claude-desktop-github',
    name: 'github',
    description: 'Claude Desktop global MCP server definition.',
    client: 'claude-desktop',
    resourceType: 'mcp-server',
    scope: 'global',
    statuses: ['found', 'not-tested'],
    path: '~/Library/Application Support/Claude/claude_desktop_config.json',
    evidence: [evidence('~/Library/Application Support/Claude/claude_desktop_config.json', 'claude-desktop-mcp', 'claude_desktop_config.json', 'mcpServers.github')],
    tags: ['mcp']
  }),
  resource({
    id: 'full-claude-desktop-logs',
    name: 'Claude Desktop logs',
    description: 'Claude Desktop log/session presence represented as metadata only.',
    client: 'claude-desktop',
    resourceType: 'log-session-store',
    scope: 'global',
    status: 'found',
    path: '~/Library/Application Support/Claude/logs',
    evidence: [evidence('~/Library/Application Support/Claude/logs', 'claude-desktop-log-session', 'Claude logs/sessions')],
    tags: ['logs', 'sessions']
  }),
  resource({
    id: 'full-codex-agents',
    name: 'AGENTS.md',
    description: 'Project instructions discovered for Codex.',
    client: 'codex',
    resourceType: 'instruction-file',
    scope: 'project-shared',
    status: 'needs-review',
    statuses: ['found', 'needs-review', 'trust-gated'],
    path: '/repo/AGENTS.md',
    evidence: [evidence('/repo/AGENTS.md', 'codex-project-instructions', 'AGENTS.md')],
    warnings: [{ kind: 'scope-concern', severity: 'warning', message: 'Project-scoped Codex AGENTS activation depends on project trust and needs review.' }],
    tags: ['instructions'],
    metadata: { layer: 'project-shared', trustGated: true, activationConfidence: 'trust-gated' }
  }),
  resource({
    id: 'full-codex-user-config',
    name: 'Codex user config',
    description: 'User-level Codex configuration file.',
    client: 'codex',
    resourceType: 'config-file',
    scope: 'global',
    path: '~/.codex/config.toml',
    evidence: [evidence('~/.codex/config.toml', 'codex-config', 'config.toml')],
    tags: ['config'],
    metadata: { layer: 'global' }
  }),
  resource({
    id: 'full-codex-user-mcp',
    name: 'github',
    description: 'User-level Codex MCP server definition.',
    client: 'codex',
    resourceType: 'mcp-server',
    scope: 'global',
    status: 'not-tested',
    statuses: ['found', 'not-tested'],
    path: '~/.codex/config.toml',
    evidence: [evidence('~/.codex/config.toml', 'codex-mcp', 'config.toml', 'mcp_servers.github')],
    tags: ['mcp'],
    metadata: { layer: 'global', sourceKeyPath: 'mcp_servers.github' }
  }),
  resource({
    id: 'full-codex-managed-config',
    name: 'Codex managed/admin config',
    description: 'Managed system/admin Codex configuration file.',
    client: 'codex',
    resourceType: 'config-file',
    scope: 'managed-admin',
    path: '/etc/codex/config.toml',
    evidence: [evidence('/etc/codex/config.toml', 'codex-config', 'config.toml')],
    tags: ['config'],
    metadata: { layer: 'managed-admin', managed: true }
  }),
  resource({
    id: 'full-codex-global-skill',
    name: 'reviewer',
    description: 'User-level Codex skill.',
    client: 'codex',
    resourceType: 'skill',
    scope: 'global',
    path: '~/.agents/skills/reviewer/SKILL.md',
    evidence: [evidence('~/.agents/skills/reviewer/SKILL.md', 'codex-file', 'SKILL.md')],
    tags: ['skill'],
    metadata: { layer: 'global' }
  }),
  resource({
    id: 'full-codex-project-rule',
    name: 'review.rules',
    description: 'Project Codex rule file.',
    client: 'codex',
    resourceType: 'rule',
    scope: 'project-shared',
    status: 'needs-review',
    statuses: ['found', 'needs-review', 'trust-gated'],
    path: '/repo/.codex/rules/review.rules',
    evidence: [evidence('/repo/.codex/rules/review.rules', 'codex-file', 'review.rules')],
    warnings: [{ kind: 'scope-concern', severity: 'warning', message: 'Project-scoped Codex rule activation depends on project trust and needs review.' }],
    tags: ['rule'],
    metadata: { layer: 'project-shared', trustGated: true, activationConfidence: 'trust-gated' }
  }),
  resource({
    id: 'full-codex-project-hook',
    name: 'pre_request',
    description: 'Project Codex hook configured in project config.',
    client: 'codex',
    resourceType: 'hook',
    scope: 'project-shared',
    status: 'needs-review',
    statuses: ['found', 'needs-review', 'trust-gated'],
    path: '/repo/.codex/config.toml',
    evidence: [evidence('/repo/.codex/config.toml', 'codex-config', 'config.toml', 'hooks.pre_request')],
    warnings: [{ kind: 'scope-concern', severity: 'warning', message: 'Project-scoped Codex hook activation depends on project trust and needs review.' }],
    tags: ['hook'],
    metadata: { layer: 'project-shared', trustGated: true, activationConfidence: 'trust-gated' }
  }),
  resource({
    id: 'full-codex-project-agent',
    name: 'reviewer',
    description: 'Project Codex custom agent.',
    client: 'codex',
    resourceType: 'custom-agent',
    scope: 'project-shared',
    status: 'needs-review',
    statuses: ['found', 'needs-review', 'trust-gated'],
    path: '/repo/.codex/agents/reviewer.toml',
    evidence: [evidence('/repo/.codex/agents/reviewer.toml', 'codex-file', 'reviewer.toml')],
    warnings: [{ kind: 'scope-concern', severity: 'warning', message: 'Project-scoped Codex custom agent activation depends on project trust and needs review.' }],
    tags: ['agent'],
    metadata: { layer: 'project-shared', trustGated: true, activationConfidence: 'trust-gated' }
  }),
  resource({
    id: 'full-codex-plugin',
    name: 'acme',
    description: 'Codex plugin manifest.',
    client: 'codex',
    resourceType: 'plugin',
    scope: 'plugin-bundled',
    path: '~/.agents/plugins/acme/plugin.json',
    evidence: [evidence('~/.agents/plugins/acme/plugin.json', 'codex-file', 'plugin.json')],
    tags: ['plugin'],
    metadata: { layer: 'plugin-bundled' }
  }),
  resource({
    id: 'full-codex-auth-store',
    name: 'Codex auth store',
    description: 'Codex auth store exists and is not read by default.',
    client: 'codex',
    resourceType: 'sensitive-store',
    scope: 'global',
    status: 'sensitive',
    statuses: ['found', 'sensitive'],
    path: '~/.codex/auth.json',
    evidence: [evidence('~/.codex/auth.json', 'codex-file', 'auth.json')],
    tags: ['sensitive'],
    metadata: { layer: 'global' }
  }),
  resource({
    id: 'full-cursor-rule',
    name: 'Svelte conventions',
    description: 'Cursor project rule for Svelte files.',
    client: 'cursor',
    resourceType: 'rule',
    scope: 'project-shared',
    path: '/repo/.cursor/rules/svelte.mdc',
    evidence: [evidence('/repo/.cursor/rules/svelte.mdc', 'cursor-project-rule', '.cursor/rules/*.mdc', 'description')],
    tags: ['rule']
  }),
  resource({
    id: 'full-cursor-global-mcp',
    name: 'globalDocs',
    description: 'Cursor global MCP server definition.',
    client: 'cursor',
    resourceType: 'mcp-server',
    scope: 'global',
    status: 'not-tested',
    statuses: ['found', 'not-tested'],
    path: '~/.cursor/mcp.json',
    evidence: [evidence('~/.cursor/mcp.json', 'cursor-global-mcp', 'Cursor global mcp.json', 'mcpServers.globalDocs')],
    tags: ['mcp']
  }),
  resource({
    id: 'full-cursor-project-mcp',
    name: 'projectDocs',
    description: 'Cursor project MCP server definition.',
    client: 'cursor',
    resourceType: 'mcp-server',
    scope: 'project-shared',
    status: 'not-tested',
    statuses: ['found', 'not-tested'],
    path: '/repo/.cursor/mcp.json',
    evidence: [evidence('/repo/.cursor/mcp.json', 'cursor-project-mcp', '.cursor/mcp.json', 'mcpServers.projectDocs')],
    tags: ['mcp']
  }),
  resource({
    id: 'full-hermes-default-profile',
    name: 'default',
    description: 'Hermes default profile environment.',
    client: 'hermes',
    resourceType: 'profile',
    scope: 'profile',
    path: '~/.hermes/profiles/default',
    evidence: [evidence('~/.hermes/profiles/default', 'hermes-profile', '~/.hermes/profiles/*')],
    tags: ['profile'],
    metadata: { profileName: 'default', mergedAcrossProfiles: false }
  }),
  resource({
    id: 'full-hermes-default-config',
    name: 'config.yaml',
    description: 'Hermes default profile configuration.',
    client: 'hermes',
    resourceType: 'config-file',
    scope: 'profile',
    path: '~/.hermes/profiles/default/config.yaml',
    evidence: [evidence('~/.hermes/profiles/default/config.yaml', 'hermes-config', 'config.yaml')],
    tags: ['config'],
    metadata: { profileName: 'default' }
  }),
  resource({
    id: 'full-hermes-default-mcp',
    name: 'github',
    description: 'Hermes default profile MCP server definition.',
    client: 'hermes',
    resourceType: 'mcp-server',
    scope: 'profile',
    status: 'not-tested',
    statuses: ['found', 'not-tested'],
    path: '~/.hermes/profiles/default/config.yaml',
    evidence: [evidence('~/.hermes/profiles/default/config.yaml', 'hermes-mcp', 'config.yaml', 'mcpServers.github')],
    tags: ['mcp'],
    metadata: { profileName: 'default', sourceKeyPath: 'mcpServers.github' }
  }),
  resource({
    id: 'full-hermes-default-skill',
    name: 'reviewer',
    description: 'Hermes default profile skill.',
    client: 'hermes',
    resourceType: 'skill',
    scope: 'profile',
    path: '~/.hermes/profiles/default/skills/reviewer/SKILL.md',
    evidence: [evidence('~/.hermes/profiles/default/skills/reviewer/SKILL.md', 'hermes-skill', 'SKILL.md')],
    tags: ['skill'],
    metadata: { profileName: 'default' }
  }),
  resource({
    id: 'full-hermes-work-profile',
    name: 'work',
    description: 'Hermes work profile environment.',
    client: 'hermes',
    resourceType: 'profile',
    scope: 'profile',
    path: '~/.hermes/profiles/work',
    evidence: [evidence('~/.hermes/profiles/work', 'hermes-profile', '~/.hermes/profiles/*')],
    tags: ['profile'],
    metadata: { profileName: 'work', mergedAcrossProfiles: false }
  }),
  resource({
    id: 'full-hermes-work-config',
    name: 'config.yaml',
    description: 'Hermes work profile configuration.',
    client: 'hermes',
    resourceType: 'config-file',
    scope: 'profile',
    path: '~/.hermes/profiles/work/config.yaml',
    evidence: [evidence('~/.hermes/profiles/work/config.yaml', 'hermes-config', 'config.yaml')],
    tags: ['config'],
    metadata: { profileName: 'work' }
  }),
  resource({
    id: 'full-hermes-work-mcp',
    name: 'docs',
    description: 'Hermes work profile MCP server definition.',
    client: 'hermes',
    resourceType: 'mcp-server',
    scope: 'profile',
    status: 'not-tested',
    statuses: ['found', 'not-tested'],
    path: '~/.hermes/profiles/work/config.yaml',
    evidence: [evidence('~/.hermes/profiles/work/config.yaml', 'hermes-mcp', 'config.yaml', 'mcpServers.docs')],
    tags: ['mcp'],
    metadata: { profileName: 'work', sourceKeyPath: 'mcpServers.docs' }
  }),
  resource({
    id: 'full-hermes-work-skill',
    name: 'reviewer',
    description: 'Hermes work profile skill with the same name as the default profile skill.',
    client: 'hermes',
    resourceType: 'skill',
    scope: 'profile',
    path: '~/.hermes/profiles/work/skills/reviewer/SKILL.md',
    evidence: [evidence('~/.hermes/profiles/work/skills/reviewer/SKILL.md', 'hermes-skill', 'SKILL.md')],
    tags: ['skill'],
    metadata: { profileName: 'work' }
  }),
  resource({
    id: 'full-hermes-work-sessions',
    name: 'Hermes work sessions',
    description: 'Hermes work profile session store represented as metadata only.',
    client: 'hermes',
    resourceType: 'log-session-store',
    scope: 'profile',
    status: 'sensitive',
    statuses: ['found', 'sensitive'],
    path: '~/.hermes/profiles/work/sessions',
    evidence: [evidence('~/.hermes/profiles/work/sessions', 'hermes-log-session-store', '~/.hermes/profiles/*/sessions')],
    tags: ['sessions'],
    metadata: { profileName: 'work' }
  }),
  resource({
    id: 'full-openclaw-state',
    name: 'OpenClaw state',
    description: 'OpenClaw local state directory is present.',
    client: 'openclaw',
    resourceType: 'client-installation',
    scope: 'global',
    path: '~/.openclaw',
    evidence: [evidence('~/.openclaw/openclaw.json', 'openclaw-state-root', '~/.openclaw')],
    tags: ['state'],
    metadata: { stateRoot: '~/.openclaw' }
  }),
  resource({
    id: 'full-openclaw-config',
    name: 'openclaw.json',
    description: 'OpenClaw global config with gateway mode hints.',
    client: 'openclaw',
    resourceType: 'config-file',
    scope: 'global',
    path: '~/.openclaw/openclaw.json',
    evidence: [evidence('~/.openclaw/openclaw.json', 'openclaw-config', 'openclaw.json')],
    warnings: [{ kind: 'runtime-caveat', severity: 'warning', message: 'OpenClaw appears configured for gateway/remote mode; local desktop inventory may not own full runtime state.' }],
    tags: ['config'],
    metadata: { gatewayOrRemoteMode: true, gatewayHintPath: 'gateway.enabled' }
  }),
  resource({
    id: 'full-openclaw-default-profile',
    name: 'default',
    description: 'OpenClaw default profile.',
    client: 'openclaw',
    resourceType: 'profile',
    scope: 'profile',
    path: '~/.openclaw/profiles/default',
    evidence: [evidence('~/.openclaw/profiles/default/config.json', 'openclaw-profile', '~/.openclaw/profiles/*')],
    tags: ['profile'],
    metadata: { profileName: 'default' }
  }),
  resource({
    id: 'full-openclaw-included-profile-config',
    name: 'config.json',
    description: 'OpenClaw profile config included from the global config.',
    client: 'openclaw',
    resourceType: 'config-file',
    scope: 'profile',
    path: '~/.openclaw/profiles/default/config.json',
    evidence: [{
      ...evidence('~/.openclaw/profiles/default/config.json', 'openclaw-included-config', 'profiles/default/config.json'),
      includedFromPath: '~/.openclaw/openclaw.json'
    }],
    tags: ['config'],
    metadata: { profileName: 'default', includedFromPath: '~/.openclaw/openclaw.json' }
  }),
  resource({
    id: 'full-openclaw-agent',
    name: 'reviewer',
    description: 'OpenClaw custom agent.',
    client: 'openclaw',
    resourceType: 'custom-agent',
    scope: 'global',
    path: '~/.openclaw/agents/reviewer.json',
    evidence: [evidence('~/.openclaw/agents/reviewer.json', 'openclaw-custom-agent', 'reviewer.json')],
    tags: ['custom-agent']
  }),
  resource({
    id: 'full-openclaw-workspace',
    name: 'uwchlan workspace',
    description: 'OpenClaw workspace state exists for a local project.',
    client: 'openclaw',
    resourceType: 'workspace',
    scope: 'local-private',
    path: '~/.openclaw/workspaces/uwchlan',
    evidence: [evidence('~/.openclaw/workspaces/uwchlan', 'openclaw-workspace', '~/.openclaw/workspaces/*')],
    metadata: { workspaceName: 'uwchlan' }
  }),
  resource({
    id: 'full-openclaw-workspace-skill',
    name: 'reviewer',
    description: 'OpenClaw workspace-local skill.',
    client: 'openclaw',
    resourceType: 'skill',
    scope: 'local-private',
    path: '~/.openclaw/workspaces/uwchlan/skills/reviewer/SKILL.md',
    evidence: [evidence('~/.openclaw/workspaces/uwchlan/skills/reviewer/SKILL.md', 'openclaw-skill', 'SKILL.md')],
    tags: ['skill'],
    metadata: { workspaceName: 'uwchlan', precedenceOutcome: 'highest-precedence' }
  }),
  resource({
    id: 'full-openclaw-plugin',
    name: 'github',
    description: 'OpenClaw plugin manifest.',
    client: 'openclaw',
    resourceType: 'plugin',
    scope: 'plugin-bundled',
    path: '~/.openclaw/plugins/github/plugin.json',
    evidence: [evidence('~/.openclaw/plugins/github/plugin.json', 'openclaw-plugin', 'plugin.json')],
    tags: ['plugin']
  }),
  resource({
    id: 'full-openclaw-migration',
    name: 'claude',
    description: 'OpenClaw imported Claude configuration source.',
    client: 'openclaw',
    resourceType: 'migration-import-source',
    scope: 'global',
    path: '~/.openclaw/imports/claude/CLAUDE.md',
    evidence: [evidence('~/.openclaw/imports/claude/CLAUDE.md', 'openclaw-migration-import-source', 'CLAUDE.md')],
    tags: ['migration']
  }),
  resource({
    id: 'full-openclaw-consumed-mcp',
    name: 'github',
    description: 'MCP server consumed by OpenClaw from the global config.',
    client: 'openclaw',
    resourceType: 'mcp-server',
    scope: 'global',
    status: 'not-tested',
    statuses: ['found', 'not-tested'],
    path: '~/.openclaw/openclaw.json',
    evidence: [evidence('~/.openclaw/openclaw.json', 'openclaw-config', 'openclaw.json', 'mcpServers.github')],
    tags: ['mcp'],
    metadata: { mcpRole: 'consumed' }
  }),
  resource({
    id: 'full-openclaw-exposed-mcp',
    name: 'OpenClaw exposed MCP server',
    description: 'OpenClaw appears configured to expose an MCP server to other clients.',
    client: 'openclaw',
    resourceType: 'mcp-server',
    scope: 'global',
    status: 'not-tested',
    statuses: ['found', 'not-tested'],
    path: '~/.openclaw/openclaw.json',
    evidence: [evidence('~/.openclaw/openclaw.json', 'openclaw-config', 'openclaw.json', 'exposes.mcpServer')],
    warnings: [{ kind: 'runtime-caveat', severity: 'info', message: 'OpenClaw exposed MCP server was not started or connectivity-tested.' }],
    tags: ['mcp'],
    metadata: { mcpRole: 'exposed' }
  }),
  resource({
    id: 'full-openclaw-unknown-mcp',
    name: 'OpenClaw MCP role',
    description: 'OpenClaw MCP configuration exists, but the consumed/exposed role is ambiguous.',
    client: 'openclaw',
    resourceType: 'mcp-server',
    scope: 'local-private',
    status: 'needs-review',
    statuses: ['found', 'not-tested', 'needs-review'],
    path: '~/.openclaw/workspaces/uwchlan/config.json',
    evidence: [evidence('~/.openclaw/workspaces/uwchlan/config.json', 'openclaw-config', 'config.json', 'mcp')],
    warnings: [{ kind: 'runtime-caveat', severity: 'warning', message: 'OpenClaw MCP role cannot be proven from this config and needs review.' }],
    tags: ['mcp'],
    metadata: { mcpRole: 'unknown', workspaceName: 'uwchlan' }
  }),
  resource({
    id: 'full-hermes-auth-store',
    name: 'Hermes auth store',
    description: 'Hermes profile auth store exists and is not read by default.',
    client: 'hermes',
    resourceType: 'sensitive-store',
    scope: 'profile',
    path: '~/.hermes/profiles/default/auth.json',
    evidence: [evidence('~/.hermes/profiles/default/auth.json', 'hermes-auth-store', '~/.hermes/profiles/*/auth.json')],
    statuses: ['found', 'sensitive'],
    tags: ['sensitive'],
    metadata: { profileName: 'default' }
  }),
  resource({
    id: 'full-openclaw-auth-store',
    name: 'OpenClaw auth store',
    description: 'OpenClaw auth store is represented as metadata only.',
    client: 'openclaw',
    resourceType: 'sensitive-store',
    scope: 'global',
    status: 'sensitive',
    statuses: ['found', 'sensitive'],
    path: '~/.openclaw/credentials/token.json',
    evidence: [evidence('~/.openclaw/credentials/token.json', 'openclaw-sensitive-store', 'OpenClaw credentials/tokens')],
    tags: ['sensitive']
  }),
  resource({
    id: 'full-openclaw-sessions',
    name: 'OpenClaw sessions',
    description: 'OpenClaw session store is represented as metadata only.',
    client: 'openclaw',
    resourceType: 'log-session-store',
    scope: 'local-private',
    path: '~/.openclaw/sessions',
    evidence: [evidence('~/.openclaw/sessions', 'openclaw-session-store', '~/.openclaw/sessions')],
    statuses: ['found', 'sensitive'],
    tags: ['sessions']
  }),
  resource({
    id: 'full-openclaw-memory',
    name: 'OpenClaw workspace memory',
    description: 'OpenClaw workspace memory store is represented as metadata only.',
    client: 'openclaw',
    resourceType: 'log-session-store',
    scope: 'local-private',
    status: 'sensitive',
    statuses: ['found', 'sensitive'],
    path: '~/.openclaw/workspaces/uwchlan/memory.json',
    evidence: [evidence('~/.openclaw/workspaces/uwchlan/memory.json', 'openclaw-log-session-memory-store', 'OpenClaw logs/sessions/memory/traces')],
    tags: ['memory'],
    metadata: { workspaceName: 'uwchlan' }
  })
];

const projectResources = [
  resource({
    id: 'project-inherited-global-github',
    name: 'github',
    description: 'Global Claude Desktop MCP server that may be visible while working in the project.',
    client: 'claude-desktop',
    resourceType: 'mcp-server',
    scope: 'global',
    status: 'inherited',
    statuses: ['found', 'inherited', 'not-tested'],
    path: '~/Library/Application Support/Claude/claude_desktop_config.json',
    evidence: [evidence('~/Library/Application Support/Claude/claude_desktop_config.json', 'claude-desktop-mcp', 'claude_desktop_config.json', 'mcpServers.github')],
    metadata: { inherited: true, activationConfidence: 'inherited', activationStates: ['found', 'inherited', 'not-tested', 'unknown'] }
  }),
  resource({
    id: 'project-codex-agents',
    name: 'Project AGENTS.md',
    description: 'Project-shared Codex instructions are likely visible from the selected project root.',
    client: 'codex',
    resourceType: 'instruction-file',
    scope: 'project-shared',
    status: 'likely-active',
    statuses: ['found', 'likely-active', 'needs-review', 'trust-gated'],
    path: '/repo/AGENTS.md',
    evidence: [evidence('/repo/AGENTS.md', 'codex-project-instructions', 'AGENTS.md')],
    warnings: [{ kind: 'runtime-caveat', severity: 'warning', message: 'Codex project instructions are trust-gated until the project is trusted.' }],
    metadata: {
      gitFileState: 'tracked',
      collaboratorVisibility: 'shared',
      activationConfidence: 'likely-active',
      activationStates: ['found', 'likely-active', 'needs-review', 'trust-gated'],
      projectRiskCategories: ['shared-committed-file']
    }
  }),
  resource({
    id: 'project-claude-local-settings',
    name: 'Claude local settings',
    description: 'Local/private Claude Code settings can affect the project without being shared.',
    client: 'claude-code',
    resourceType: 'config-file',
    scope: 'local-private',
    status: 'needs-review',
    statuses: ['found', 'needs-review'],
    path: '/repo/.claude/settings.local.json',
    evidence: [evidence('/repo/.claude/settings.local.json', 'claude-code-config', 'settings.local.json')],
    warnings: [{ kind: 'runtime-caveat', severity: 'info', message: 'Local/private project files may not be visible to collaborators.' }],
    metadata: {
      gitFileState: 'ignored',
      collaboratorVisibility: 'private',
      activationConfidence: 'needs-review',
      activationStates: ['found', 'needs-review'],
      projectRiskCategories: ['local-private-collaboration']
    }
  })
];

const duplicateResources = [
  resource({
    id: 'duplicate-claude-desktop-github',
    name: 'github',
    description: 'Claude Desktop MCP server named github.',
    client: 'claude-desktop',
    resourceType: 'mcp-server',
    scope: 'global',
    status: 'duplicate',
    statuses: ['found', 'duplicate', 'not-tested'],
    path: '~/Library/Application Support/Claude/claude_desktop_config.json',
    evidence: [evidence('~/Library/Application Support/Claude/claude_desktop_config.json', 'claude-desktop-mcp', 'claude_desktop_config.json', 'mcpServers.github')],
    relationships: [{ kind: 'similar-to', targetResourceId: 'duplicate-cursor-github', note: 'Same name, different command shape.' }]
  }),
  resource({
    id: 'duplicate-cursor-github',
    name: 'github',
    description: 'Cursor project MCP server named github.',
    client: 'cursor',
    resourceType: 'mcp-server',
    scope: 'project-shared',
    status: 'duplicate',
    statuses: ['found', 'duplicate', 'not-tested'],
    path: '/repo/.cursor/mcp.json',
    evidence: [evidence('/repo/.cursor/mcp.json', 'cursor-project-mcp', '.cursor/mcp.json', 'mcpServers.github')],
    relationships: [{ kind: 'similar-to', targetResourceId: 'duplicate-claude-desktop-github', note: 'Same name, different scope.' }]
  })
];

const secretWarningResources = [
  resource({
    id: 'secret-cursor-inline-token',
    name: 'Project MCP with inline token',
    description: 'A project config appears to include a secret-like inline value.',
    client: 'cursor',
    resourceType: 'config-file',
    scope: 'project-shared',
    status: 'needs-review',
    statuses: ['found', 'sensitive', 'needs-review'],
    path: '/repo/.cursor/mcp.json',
    previewPolicy: 'redacted-preview',
    evidence: [evidence('/repo/.cursor/mcp.json', 'cursor-project-mcp', '.cursor/mcp.json', 'mcpServers.internal.env.API_TOKEN')],
    warnings: [{
      kind: 'secret-auth-concern',
      severity: 'warning',
      message: 'Project config contains a secret-like value and may be committed.'
    }]
  })
];

function parseErrorResource(input: {
  id: string;
  name: string;
  description: string;
  client: CapabilityClient;
  path: string;
  scannerRule: string;
  matchedPathPattern: string;
  message: string;
  scope?: CapabilityScope;
}): CapabilityResource {
  const sourceEvidence: CapabilityEvidence = {
    sourcePath: input.path,
    scannerRule: input.scannerRule,
    matchedPathPattern: input.matchedPathPattern,
    readStatus: 'read',
    parseStatus: 'parse-error'
  };

  return resource({
    id: input.id,
    name: input.name,
    description: input.description,
    client: input.client,
    resourceType: 'config-file',
    scope: input.scope ?? 'global',
    status: 'parse-error',
    path: input.path,
    evidence: [sourceEvidence],
    warnings: [{ kind: 'parse-read-problem', severity: 'error', message: input.message, evidence: sourceEvidence }]
  });
}

const parseReadResources = [
  parseErrorResource({
    id: 'parse-error-claude-code-settings',
    name: 'Claude Code settings',
    description: 'Claude Code settings exist but could not be parsed.',
    client: 'claude-code',
    path: '~/.claude/settings.json',
    scannerRule: 'claude-code-config',
    matchedPathPattern: 'settings.json',
    message: 'Unexpected token while parsing Claude Code settings.'
  }),
  parseErrorResource({
    id: 'parse-error-claude-desktop-config',
    name: 'Claude Desktop config',
    description: 'Claude Desktop config exists but could not be parsed.',
    client: 'claude-desktop',
    path: '~/Library/Application Support/Claude/claude_desktop_config.json',
    scannerRule: 'claude-desktop-config',
    matchedPathPattern: 'claude_desktop_config.json',
    message: 'Unexpected token while parsing Claude Desktop config.'
  }),
  parseErrorResource({
    id: 'parse-error-codex-config',
    name: 'Codex config',
    description: 'Codex config exists but could not be parsed.',
    client: 'codex',
    path: '~/.codex/config.toml',
    scannerRule: 'codex-config',
    matchedPathPattern: 'config.toml',
    message: 'Unexpected token while parsing Codex config.'
  }),
  parseErrorResource({
    id: 'parse-error-cursor-mcp',
    name: 'Cursor MCP config',
    description: 'Cursor MCP config exists but could not be parsed.',
    client: 'cursor',
    path: '/repo/.cursor/mcp.json',
    scannerRule: 'cursor-project-mcp',
    matchedPathPattern: '.cursor/mcp.json',
    message: 'Unexpected token while parsing Cursor MCP config.',
    scope: 'project-shared'
  }),
  parseErrorResource({
    id: 'parse-error-hermes-config',
    name: 'Hermes config',
    description: 'Hermes config exists but could not be parsed.',
    client: 'hermes',
    path: '~/.hermes/profiles/default/config.yaml',
    scannerRule: 'hermes-config',
    matchedPathPattern: 'config.yaml',
    message: 'Unexpected token while parsing Hermes config.',
    scope: 'profile'
  }),
  parseErrorResource({
    id: 'parse-error-openclaw-config',
    name: 'OpenClaw config',
    description: 'OpenClaw config exists but could not be parsed.',
    client: 'openclaw',
    path: '~/.openclaw/openclaw.json',
    scannerRule: 'openclaw-config',
    matchedPathPattern: 'openclaw.json',
    message: 'Unexpected token while parsing OpenClaw config.'
  }),
  resource({
    id: 'read-error-openclaw-auth',
    name: 'OpenClaw auth store',
    description: 'OpenClaw auth store exists but could not be read.',
    client: 'openclaw',
    resourceType: 'sensitive-store',
    scope: 'global',
    status: 'read-error',
    path: '~/.openclaw/auth.json',
    evidence: [{
      sourcePath: '~/.openclaw/auth.json',
      scannerRule: 'openclaw-auth-store',
      matchedPathPattern: '~/.openclaw/auth.json',
      readStatus: 'unreadable',
      parseStatus: 'skipped'
    }],
    warnings: [{ kind: 'parse-read-problem', severity: 'error', message: 'Permission denied while reading auth store.' }]
  })
];

const parseReadParseErrors = parseReadResources
  .filter((item) => item.evidence[0]?.parseStatus === 'parse-error')
  .map((item) => ({
    id: `fixture-${item.id}`,
    client: item.client,
    path: item.path ?? item.evidence[0].sourcePath ?? item.id,
    message: item.warnings[0]?.message ?? `${item.name} parse error`,
    evidence: item.evidence[0]
  }));

const parseReadReadErrors = parseReadResources
  .filter((item) => item.evidence[0]?.readStatus === 'unreadable')
  .map((item) => ({
    id: `fixture-${item.id}`,
    client: item.client,
    path: item.path ?? item.evidence[0].sourcePath ?? item.id,
    message: item.warnings[0]?.message ?? `${item.name} read error`,
    evidence: item.evidence[0]
  }));

const notFoundResources = notFoundLocations.map((location) => resource({
  id: `not-found-${location.client}`,
  name: `${location.client} not found`,
  description: `${location.label} was not found in known locations.`,
  client: location.client,
  resourceType: 'client-installation',
  scope: location.scope,
  status: 'not-found',
  evidence: [location.evidence],
  tags: ['client']
}));

const largeInventoryResources = Array.from({ length: 1_200 }, (_unused, index) => {
  const clients: CapabilityClient[] = ['claude-code', 'claude-desktop', 'codex', 'cursor'];
  const types: CapabilityResourceType[] = ['config-file', 'mcp-server', 'skill', 'rule', 'hook'];
  const client = clients[index % clients.length];
  const resourceType = types[index % types.length];
  return resource({
    id: `large-${index}`,
    name: `Generated ${resourceType} ${index}`,
    description: `Generated large-inventory ${resourceType} record.`,
    client,
    resourceType,
    scope: index % 2 === 0 ? 'global' : 'project-shared',
    status: index % 11 === 0 ? 'needs-review' : 'found',
    path: `/fixtures/large/${client}/${resourceType}-${index}.json`,
    evidence: [evidence(`/fixtures/large/${client}/${resourceType}-${index}.json`, 'large-fixture', '/fixtures/large/**/*')],
    tags: ['large-fixture', `bucket-${index % 40}`],
    metadata: {
      index,
      bucket: `bucket-${index % 40}`
    }
  });
});

export const fixtureScenarios: InventoryFixtureScenario[] = [
  {
    id: 'empty-machine',
    label: 'Empty machine',
    description: 'No capability resources discovered; known client locations are absent.',
    summary: createEmptyScanSummary({ id: 'fixture-empty-machine', generatedAt, dataSource: 'fixture', knownClientLocations: notFoundLocations })
  },
  {
    id: 'full-machine',
    label: 'Full machine',
    description: 'All supported clients have representative capability resources.',
    summary: createEmptyScanSummary({ id: 'fixture-full-machine', generatedAt, dataSource: 'fixture', resources: fullMachineResources, knownClientLocations: clientLocations })
  },
  {
    id: 'project-inherited-globals',
    label: 'Project with inherited globals',
    description: 'Project inventory shows local project resources alongside inherited global resources.',
    summary: createEmptyScanSummary({
      id: 'fixture-project-inherited-globals',
      generatedAt,
      dataSource: 'fixture',
      resources: projectResources,
      knownClientLocations: clientLocations,
      selectedProject: {
        rootPath: '/repo',
        selectedPath: '/repo',
        repoRootPath: '/repo',
        scanRootPath: '/repo',
        normalizedProjectId: '/repo',
        displayName: 'repo',
        trustState: 'unknown',
        gitRootStatus: 'found'
      }
    })
  },
  {
    id: 'duplicate-mcp-names',
    label: 'Duplicate MCP names',
    description: 'Same MCP server name appears in multiple clients and scopes without assuming equivalence.',
    summary: createEmptyScanSummary({ id: 'fixture-duplicate-mcp-names', generatedAt, dataSource: 'fixture', resources: duplicateResources, knownClientLocations: clientLocations })
  },
  {
    id: 'secret-warning',
    label: 'Secret warning',
    description: 'A project config contains a secret-like value but exposes only redacted metadata.',
    summary: createEmptyScanSummary({ id: 'fixture-secret-warning', generatedAt, dataSource: 'fixture', resources: secretWarningResources, knownClientLocations: clientLocations })
  },
  {
    id: 'parse-read-error',
    label: 'Parse/read error',
    description: 'Unreadable and unparseable files are represented without raw content.',
    summary: createEmptyScanSummary({
      id: 'fixture-parse-read-error',
      generatedAt,
      dataSource: 'fixture',
      resources: parseReadResources,
      knownClientLocations: clientLocations,
      parseErrors: parseReadParseErrors,
      readErrors: parseReadReadErrors
    })
  },
  {
    id: 'not-found-clients',
    label: 'Not-found clients',
    description: 'Known locations were checked and all supported clients are absent.',
    summary: createEmptyScanSummary({ id: 'fixture-not-found-clients', generatedAt, dataSource: 'fixture', resources: notFoundResources, knownClientLocations: notFoundLocations })
  },
  {
    id: 'large-inventory',
    label: 'Large inventory',
    description: 'Generated high-volume fixture for table filtering, sorting, and pagination safeguards.',
    summary: createEmptyScanSummary({ id: 'fixture-large-inventory', generatedAt, dataSource: 'fixture', resources: largeInventoryResources, knownClientLocations: clientLocations })
  }
];

export function getFixtureScenario(id: InventoryFixtureScenarioId): InventoryFixtureScenario {
  return fixtureScenarios.find((scenario) => scenario.id === id) ?? fixtureScenarios[0];
}

export function resourcesFromFixtureScenario(id: InventoryFixtureScenarioId): CapabilityResource[] {
  return getFixtureScenario(id).summary.resources;
}
