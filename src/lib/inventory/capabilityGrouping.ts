import type { CapabilityResource, CapabilityResourceType } from './types';

export interface CapabilityGroupingKeys {
  primaryKey: string;
  nameKey: string;
  sourceKey: string;
  clientEvidenceKey: string;
  launchKey?: string;
  relatedKeys: string[];
}

export interface CapabilityGroup {
  key: string;
  resourceType: CapabilityResourceType;
  name: string;
  rows: CapabilityResource[];
  clients: string[];
  scopes: string[];
  sourceLocations: string[];
  relatedKeys: string[];
}

function normalizeText(value: string | undefined): string {
  const normalized = (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return normalized || 'unknown';
}

function normalizePath(value: string | undefined): string {
  return (value ?? '').replace(/\\/g, '/').toLowerCase() || 'unknown-source';
}

export function sourceLocation(resource: CapabilityResource): string {
  return resource.path ?? resource.evidence[0]?.sourcePath ?? resource.evidence[0]?.sourceLabel ?? 'unknown source';
}

function stringMetadata(resource: CapabilityResource, key: string): string {
  const value = resource.metadata[key];
  return typeof value === 'string' ? value.trim() : '';
}

function stringArrayMetadata(resource: CapabilityResource, key: string): string[] {
  const value = resource.metadata[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function launchSignature(resource: CapabilityResource): string {
  const command = stringMetadata(resource, 'command');
  const packageHint = stringMetadata(resource, 'package');
  const url = stringMetadata(resource, 'url');
  const args = stringArrayMetadata(resource, 'args').join(' ');
  return normalizeText([command, packageHint, url, args].filter(Boolean).join(' '));
}

function hasLaunchHints(resource: CapabilityResource): boolean {
  return Boolean(stringMetadata(resource, 'command') || stringMetadata(resource, 'package') || stringMetadata(resource, 'url') || stringArrayMetadata(resource, 'args').length);
}

function primaryKeyFor(resource: CapabilityResource, nameKey: string, sourceKey: string, launchKey?: string): string {
  if (resource.resourceType === 'mcp-server' && launchKey) return launchKey;
  if (resource.resourceType === 'sensitive-store') return sourceKey;
  if (resource.resourceType === 'log-session-store') return sourceKey;
  if (resource.resourceType === 'profile') return `${resource.resourceType}:name:${normalizeText(resource.name)}:client:${resource.client}`;
  return nameKey;
}

export function buildCapabilityGroupingKeys(resource: CapabilityResource): CapabilityGroupingKeys {
  const normalizedName = normalizeText(resource.name);
  const evidence = resource.evidence[0];
  const nameKey = `${resource.resourceType}:name:${normalizedName}`;
  const sourceKey = `${resource.resourceType}:source:${normalizePath(sourceLocation(resource))}`;
  const clientEvidenceKey = `${resource.resourceType}:client-evidence:${resource.client}:${normalizeText(evidence?.scannerRule)}:${normalizeText(evidence?.parsedKeyPath ?? evidence?.matchedPathPattern)}`;
  const launchKey = hasLaunchHints(resource) ? `${resource.resourceType}:launch:${launchSignature(resource)}` : undefined;
  const relatedKeys = Array.from(new Set([
    nameKey,
    sourceKey,
    clientEvidenceKey,
    ...(launchKey ? [launchKey] : [])
  ]));

  return {
    primaryKey: primaryKeyFor(resource, nameKey, sourceKey, launchKey),
    nameKey,
    sourceKey,
    clientEvidenceKey,
    launchKey,
    relatedKeys
  };
}

export function groupCapabilities(resources: CapabilityResource[]): CapabilityGroup[] {
  const groups = new Map<string, CapabilityGroup>();

  for (const resource of resources) {
    const keys = buildCapabilityGroupingKeys(resource);
    const group = groups.get(keys.primaryKey) ?? {
      key: keys.primaryKey,
      resourceType: resource.resourceType,
      name: resource.name,
      rows: [],
      clients: [],
      scopes: [],
      sourceLocations: [],
      relatedKeys: []
    };

    group.rows.push(resource);
    group.clients = Array.from(new Set([...group.clients, resource.client])).sort();
    group.scopes = Array.from(new Set([...group.scopes, resource.scope])).sort();
    group.sourceLocations = Array.from(new Set([...group.sourceLocations, sourceLocation(resource)])).sort();
    group.relatedKeys = Array.from(new Set([...group.relatedKeys, ...keys.relatedKeys])).sort();
    groups.set(keys.primaryKey, group);
  }

  return Array.from(groups.values()).sort((left, right) => left.resourceType.localeCompare(right.resourceType) || left.name.localeCompare(right.name));
}
