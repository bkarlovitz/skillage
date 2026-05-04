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
    id: 'full-codex-agents',
    name: 'AGENTS.md',
    description: 'Project instructions discovered for Codex.',
    client: 'codex',
    resourceType: 'instruction-file',
    scope: 'project-shared',
    path: '/repo/AGENTS.md',
    evidence: [evidence('/repo/AGENTS.md', 'codex-project-instructions', 'AGENTS.md')],
    tags: ['instructions']
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
    id: 'full-hermes-default-profile',
    name: 'default',
    description: 'Hermes default profile environment.',
    client: 'hermes',
    resourceType: 'profile',
    scope: 'profile',
    path: '~/.hermes/profiles/default',
    evidence: [evidence('~/.hermes/profiles/default', 'hermes-profile', '~/.hermes/profiles/*')]
  }),
  resource({
    id: 'full-openclaw-workspace',
    name: 'uwchlan workspace',
    description: 'OpenClaw workspace state exists for a local project.',
    client: 'openclaw',
    resourceType: 'workspace',
    scope: 'local-private',
    path: '~/.openclaw/workspaces/uwchlan',
    evidence: [evidence('~/.openclaw/workspaces/uwchlan', 'openclaw-workspace', '~/.openclaw/workspaces/*')]
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

const parseReadResources = [
  resource({
    id: 'parse-error-cursor-mcp',
    name: 'Cursor MCP config',
    description: 'Cursor MCP config exists but could not be parsed.',
    client: 'cursor',
    resourceType: 'config-file',
    scope: 'project-shared',
    status: 'parse-error',
    path: '/repo/.cursor/mcp.json',
    evidence: [{
      sourcePath: '/repo/.cursor/mcp.json',
      scannerRule: 'cursor-project-mcp',
      matchedPathPattern: '.cursor/mcp.json',
      readStatus: 'read',
      parseStatus: 'parse-error'
    }],
    warnings: [{ kind: 'parse-read-problem', severity: 'error', message: 'Unexpected token while parsing Cursor MCP config.' }]
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
      parseErrors: [{
        id: 'fixture-parse-error-cursor-mcp',
        client: 'cursor',
        path: '/repo/.cursor/mcp.json',
        message: 'Unexpected token while parsing Cursor MCP config.',
        evidence: parseReadResources[0].evidence[0]
      }],
      readErrors: [{
        id: 'fixture-read-error-openclaw-auth',
        client: 'openclaw',
        path: '~/.openclaw/auth.json',
        message: 'Permission denied while reading auth store.',
        evidence: parseReadResources[1].evidence[0]
      }]
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
