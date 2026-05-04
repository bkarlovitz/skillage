import type { ClientDetailViewModel } from './clientSummary';
import type { KnownClientLocation } from './scan';
import type { CapabilityResource } from './types';

export interface ClientSpecificDetailRow {
  label: string;
  value: string;
  resourceId?: string;
  path?: string;
  caveat?: string;
}

export interface ClientSpecificDetailSection {
  id: string;
  title: string;
  description: string;
  rows: ClientSpecificDetailRow[];
}

function sourcePath(resource: CapabilityResource): string {
  return resource.path ?? resource.evidence[0]?.sourcePath ?? resource.evidence[0]?.sourceLabel ?? 'unknown source';
}

function firstCaveat(resource: CapabilityResource): string {
  return resource.warnings[0]?.message ?? '';
}

function row(resource: CapabilityResource, value?: string): ClientSpecificDetailRow {
  return {
    label: resource.name,
    value: value ?? resource.resourceType,
    resourceId: resource.id,
    path: sourcePath(resource),
    caveat: firstCaveat(resource)
  };
}

function locationRow(location: KnownClientLocation, value?: string): ClientSpecificDetailRow {
  return {
    label: location.label,
    value: value ?? (location.exists ? 'found' : 'not found'),
    path: location.path ?? location.evidence.sourcePath,
    caveat: location.exists ? '' : 'Expected location was not found; verify client install path and platform-specific config path.'
  };
}

function section(id: string, title: string, description: string, resources: CapabilityResource[], value?: (resource: CapabilityResource) => string): ClientSpecificDetailSection {
  return {
    id,
    title,
    description,
    rows: resources.map((resource) => row(resource, value?.(resource)))
  };
}

function hasTrustCaveat(resource: CapabilityResource): boolean {
  return resource.scope === 'project-shared'
    && (resource.status === 'needs-review'
      || (resource.statuses ?? []).includes('needs-review')
      || resource.warnings.some((warning) => warning.message.toLowerCase().includes('trust')));
}

function stringMetadata(resource: CapabilityResource, key: string): string | undefined {
  const value = resource.metadata[key];
  return typeof value === 'string' ? value : undefined;
}

function booleanMetadata(resource: CapabilityResource, key: string): boolean {
  return resource.metadata[key] === true;
}

function codexLayer(resource: CapabilityResource): string {
  return stringMetadata(resource, 'layer') ?? resource.scope;
}

function codexActivationState(resource: CapabilityResource): string {
  const statuses = resource.statuses ?? [];

  if (booleanMetadata(resource, 'trustGated')
    || resource.status === 'trust-gated'
    || statuses.includes('trust-gated')
    || hasTrustCaveat(resource)) {
    return 'trust-gated';
  }

  const confidence = stringMetadata(resource, 'activationConfidence');
  if (confidence) return confidence;
  if (resource.status === 'active' || resource.status === 'likely-active' || resource.status === 'inherited' || resource.status === 'disabled' || resource.status === 'blocked') return resource.status;
  if (resource.status === 'sensitive') return 'sensitive';
  if (resource.status === 'parse-error' || resource.status === 'read-error') return resource.status;
  return 'unknown';
}

function codexLayerActivation(resource: CapabilityResource): string {
  return `${codexLayer(resource)} · ${codexActivationState(resource)}`;
}

function codexKeyedLayerActivation(resource: CapabilityResource): string {
  const keyPath = resource.evidence[0]?.parsedKeyPath ?? stringMetadata(resource, 'sourceKeyPath');
  return keyPath ? `${codexLayerActivation(resource)} · ${keyPath}` : codexLayerActivation(resource);
}

function isCodexAgentsFile(resource: CapabilityResource): boolean {
  const path = sourcePath(resource);
  return resource.resourceType === 'instruction-file'
    && (resource.name === 'AGENTS.md'
      || resource.name === 'AGENTS.override.md'
      || path.endsWith('/AGENTS.md')
      || path.endsWith('/AGENTS.override.md'));
}

function hasCodexTrustGate(resource: CapabilityResource): boolean {
  return resource.scope === 'project-shared'
    && (booleanMetadata(resource, 'trustGated')
      || resource.status === 'needs-review'
      || resource.status === 'trust-gated'
      || (resource.statuses ?? []).some((status) => status === 'needs-review' || status === 'trust-gated')
      || resource.warnings.some((warning) => warning.message.toLowerCase().includes('trust')));
}

function hermesProfileName(resource: CapabilityResource): string {
  const profileName = stringMetadata(resource, 'profileName');
  if (profileName) return profileName;
  if (resource.scope === 'profile') return resource.name;
  if (resource.scope === 'plugin-bundled') return stringMetadata(resource, 'bundleKind') || 'plugin-bundled';
  return resource.scope;
}

function hermesWorldValue(resource: CapabilityResource): string {
  return `${hermesProfileName(resource)} · ${resource.resourceType}`;
}

function hermesMcpValue(resource: CapabilityResource): string {
  const keyPath = resource.evidence[0]?.parsedKeyPath ?? stringMetadata(resource, 'sourceKeyPath');
  return keyPath ? `${hermesProfileName(resource)} · ${keyPath}` : hermesProfileName(resource);
}

function hermesProfileCaveatRows(resources: CapabilityResource[]): ClientSpecificDetailRow[] {
  const profileRows = resources
    .filter((resource) => resource.resourceType === 'profile')
    .map((resource) => ({
      ...row(resource, `${hermesProfileName(resource)} · distinct profile world`),
      caveat: 'Hermes profile resources are reported separately and are not merged across profile names.'
    }));
  const warningRows = resources
    .filter((resource) => resource.resourceType !== 'profile'
      && (resource.warnings.length > 0 || booleanMetadata(resource, 'internalArtifact')))
    .map((resource) => row(resource, firstCaveat(resource) || `${hermesProfileName(resource)} · internal artifact`));

  return [...profileRows, ...warningRows];
}

export function buildClaudeCodeDetailSections(detail: ClientDetailViewModel): ClientSpecificDetailSection[] {
  const resources = detail.resources;
  const globalSettings = resources.filter((resource) => resource.resourceType === 'config-file' && resource.scope === 'global');
  const projectSettings = resources.filter((resource) => resource.resourceType === 'config-file' && resource.scope === 'project-shared');
  const localSettings = resources.filter((resource) => resource.scope === 'local-private');
  const skills = resources.filter((resource) => resource.resourceType === 'skill');
  const projectMcp = resources.filter((resource) => resource.resourceType === 'mcp-server' && resource.scope === 'project-shared');
  const instructions = resources.filter((resource) => resource.resourceType === 'instruction-file' && !resource.tags.includes('command'));
  const commands = resources.filter((resource) => resource.resourceType === 'instruction-file' && resource.tags.includes('command'));
  const hooks = resources.filter((resource) => resource.resourceType === 'hook');
  const plugins = resources.filter((resource) => resource.resourceType === 'plugin');
  const trustWarnings = resources.filter(hasTrustCaveat);

  return [
    section('claude-code-global-settings', 'Global Settings', 'User-level Claude Code settings and permissions.', globalSettings),
    section('claude-code-project-settings', 'Project Settings', 'Project-shared Claude Code configuration files.', projectSettings),
    section('claude-code-project-mcp', 'Project MCP Definitions', 'Project MCP servers found in Claude Code project config.', projectMcp, (resource) => {
      const parsedKey = resource.evidence[0]?.parsedKeyPath;
      return parsedKey ? `${resource.status} · ${parsedKey}` : resource.status;
    }),
    section('claude-code-skills', 'Skills', 'Global, project, and plugin-provided Claude Code skills.', skills, (resource) => resource.scope),
    section('claude-code-instructions', 'Instruction Files', 'CLAUDE.md and related instruction files.', instructions, (resource) => resource.scope),
    section('claude-code-commands', 'Commands', 'Markdown command files discovered under Claude Code command directories.', commands, (resource) => resource.scope),
    section('claude-code-hooks', 'Hooks', 'Hook definitions that can run local commands.', hooks, (resource) => resource.status),
    section('claude-code-plugins', 'Plugins', 'Claude Code plugins and bundled plugin resources.', plugins, (resource) => resource.scope),
    section('claude-code-local-private', 'Local/Private Settings', 'Project-local settings and local instruction overrides.', localSettings, (resource) => resource.status),
    section('claude-code-trust', 'Trust Review', 'Project Claude Code resources that should not be treated as active without trust evidence.', trustWarnings, (resource) => firstCaveat(resource) || resource.status)
  ].filter((item) => item.rows.length > 0);
}

export function buildClaudeDesktopDetailSections(detail: ClientDetailViewModel): ClientSpecificDetailSection[] {
  const configLocations = detail.knownLocations.filter((location) => location.resourceType === 'config-file');
  const globalMcp = detail.resources.filter((resource) => resource.resourceType === 'mcp-server' && resource.scope === 'global');
  const logs = detail.resources.filter((resource) => resource.resourceType === 'log-session-store');
  const missingLocations = configLocations.filter((location) => !location.exists);
  const restartRows: ClientSpecificDetailRow[] = globalMcp.length || configLocations.some((location) => location.exists)
    ? [{
      label: 'Restart required',
      value: 'Config changes require restarting Claude Desktop.',
      path: configLocations.find((location) => location.path)?.path,
      caveat: 'This inventory never restarts Claude Desktop or performs restart actions.'
    }]
    : [];

  return [
    {
      id: 'claude-desktop-config-path',
      title: 'Exact Config Path',
      description: 'Claude Desktop reads MCP servers from its desktop config file.',
      rows: configLocations.map((location) => locationRow(location))
    },
    section('claude-desktop-global-mcp', 'Global Desktop MCP', 'Claude Desktop MCP servers are global desktop resources.', globalMcp, (resource) => resource.status),
    section('claude-desktop-logs', 'Logs And Sessions', 'Claude Desktop log/session presence is metadata-only.', logs, (resource) => resource.previewPolicy ?? 'metadata-only'),
    {
      id: 'claude-desktop-restart',
      title: 'Restart Caveat',
      description: 'Config edits are not applied by this inventory.',
      rows: restartRows
    },
    {
      id: 'claude-desktop-path-state',
      title: 'Not-Found/Wrong-Path State',
      description: 'Missing expected paths are represented without trying alternate unsafe locations.',
      rows: missingLocations.map((location) => locationRow(location, 'not found or wrong path'))
    }
  ].filter((item) => item.rows.length > 0);
}

export function buildCursorDetailSections(detail: ClientDetailViewModel): ClientSpecificDetailSection[] {
  const globalMcp = detail.resources.filter((resource) => resource.resourceType === 'mcp-server' && resource.scope === 'global');
  const projectMcp = detail.resources.filter((resource) => resource.resourceType === 'mcp-server' && resource.scope === 'project-shared');
  const projectRules = detail.resources.filter((resource) => resource.resourceType === 'rule' && resource.path?.includes('/.cursor/rules/'));
  const legacyRules = detail.resources.filter((resource) => resource.resourceType === 'rule' && (resource.name === '.cursorrules' || resource.path?.endsWith('.cursorrules')));
  const parseWarnings = detail.resources.filter((resource) => resource.status === 'parse-error'
    || resource.warnings.some((warning) => warning.kind === 'parse-read-problem' || warning.message.toLowerCase().includes('schema')));

  return [
    section('cursor-global-mcp', 'Global MCP', 'Cursor user-level MCP servers and config.', globalMcp, (resource) => sourcePath(resource)),
    section('cursor-project-mcp', 'Project MCP', 'Cursor project MCP servers scoped to the selected workspace.', projectMcp, (resource) => sourcePath(resource)),
    section('cursor-project-rules', 'Project Rules', 'Cursor MDC project rules.', projectRules, (resource) => resource.status),
    section('cursor-legacy-rules', 'Legacy Rule Warnings', 'Legacy .cursorrules files are shown separately from MDC rules.', legacyRules, (resource) => firstCaveat(resource) || resource.status),
    section('cursor-parse-schema-warnings', 'Schema/Parse Warnings', 'Malformed Cursor config or rule schema mismatch warnings.', parseWarnings, (resource) => firstCaveat(resource) || resource.status)
  ].filter((item) => item.rows.length > 0);
}

export function buildCodexDetailSections(detail: ClientDetailViewModel): ClientSpecificDetailSection[] {
  const resources = detail.resources;
  const mcpServers = resources.filter((resource) => resource.resourceType === 'mcp-server');
  const agentsFiles = resources.filter(isCodexAgentsFile);
  const skillsAndRules = resources.filter((resource) => resource.resourceType === 'skill' || resource.resourceType === 'rule');
  const hooksAndAgents = resources.filter((resource) => resource.resourceType === 'hook' || resource.resourceType === 'custom-agent');
  const plugins = resources.filter((resource) => resource.resourceType === 'plugin');
  const authStores = resources.filter((resource) => resource.resourceType === 'sensitive-store');
  const trustGates = resources.filter(hasCodexTrustGate);

  return [
    section('codex-layers', 'Codex Layers', 'User, project, system/admin, managed, local/private, and plugin-bundled Codex resources.', resources, codexLayerActivation),
    section('codex-mcp', 'MCP Servers', 'Codex MCP servers with the layer that introduced each definition.', mcpServers, codexKeyedLayerActivation),
    section('codex-agents-files', 'AGENTS Files', 'Codex AGENTS instruction files and their activation caveats.', agentsFiles, codexLayerActivation),
    section('codex-skills-rules', 'Skills And Rules', 'Codex skills and rule files discovered across user, project, and plugin layers.', skillsAndRules, codexLayerActivation),
    section('codex-hooks-agents', 'Hooks And Custom Agents', 'Codex hooks and custom agents that may execute project-specific behavior.', hooksAndAgents, codexKeyedLayerActivation),
    section('codex-plugins', 'Plugins', 'Codex plugins and plugin-provided resources.', plugins, codexLayerActivation),
    section('codex-auth-stores', 'Auth Stores', 'Codex auth/token stores are represented as metadata-only resources.', authStores, (resource) => `${codexLayer(resource)} · ${resource.previewPolicy ?? 'metadata-only'}`),
    section('codex-trust-gates', 'Trust-Gated Project Resources', 'Project-scoped Codex resources that require explicit trust or review before treating them as active.', trustGates, (resource) => firstCaveat(resource) || codexActivationState(resource))
  ].filter((item) => item.rows.length > 0);
}

export function buildHermesDetailSections(detail: ClientDetailViewModel): ClientSpecificDetailSection[] {
  const resources = detail.resources;
  const profiles = resources.filter((resource) => resource.resourceType === 'profile');
  const profileResources = resources.filter((resource) => resource.scope === 'profile' && resource.resourceType !== 'profile');
  const mcpServers = resources.filter((resource) => resource.resourceType === 'mcp-server');
  const skills = resources.filter((resource) => resource.resourceType === 'skill');
  const configs = resources.filter((resource) => resource.resourceType === 'config-file');
  const sensitiveStores = resources.filter((resource) => resource.resourceType === 'sensitive-store');
  const logSessions = resources.filter((resource) => resource.resourceType === 'log-session-store');

  return [
    section('hermes-profiles', 'Profile Worlds', 'Default and named Hermes profiles are shown as separate environments.', profiles, (resource) => `${hermesProfileName(resource)} · not merged`),
    section('hermes-profile-resources', 'Profile Resources', 'Profile-scoped Hermes resources retain their profile boundary.', profileResources, hermesWorldValue),
    section('hermes-mcp', 'Profile MCP Servers', 'Hermes MCP servers are listed under the profile or scope that introduced them.', mcpServers, hermesMcpValue),
    section('hermes-skills', 'Skills', 'Hermes user, profile, bundled, cached, and quarantined skills.', skills, hermesWorldValue),
    section('hermes-config', 'Config Files', 'Hermes config files that define profile behavior and MCP metadata.', configs, hermesWorldValue),
    section('hermes-sensitive-stores', 'Environment And Auth Stores', 'Hermes environment/auth stores are represented without raw secret content.', sensitiveStores, (resource) => `${hermesProfileName(resource)} · ${resource.previewPolicy ?? 'unread-sensitive'}`),
    section('hermes-logs-sessions', 'Logs And Sessions', 'Hermes logs, transcripts, and sessions are metadata-only.', logSessions, (resource) => `${hermesProfileName(resource)} · ${resource.previewPolicy ?? 'metadata-only'}`),
    {
      id: 'hermes-profile-caveats',
      title: 'Profile Caveats',
      description: 'Profile isolation and internal artifact caveats that affect interpretation.',
      rows: hermesProfileCaveatRows(resources)
    }
  ].filter((item) => item.rows.length > 0);
}

export function buildClientSpecificSections(detail: ClientDetailViewModel): ClientSpecificDetailSection[] {
  if (detail.client === 'claude-code') return buildClaudeCodeDetailSections(detail);
  if (detail.client === 'claude-desktop') return buildClaudeDesktopDetailSections(detail);
  if (detail.client === 'codex') return buildCodexDetailSections(detail);
  if (detail.client === 'cursor') return buildCursorDetailSections(detail);
  if (detail.client === 'hermes') return buildHermesDetailSections(detail);
  return [];
}
