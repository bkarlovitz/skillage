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

export function buildClientSpecificSections(detail: ClientDetailViewModel): ClientSpecificDetailSection[] {
  if (detail.client === 'claude-code') return buildClaudeCodeDetailSections(detail);
  if (detail.client === 'claude-desktop') return buildClaudeDesktopDetailSections(detail);
  return [];
}
