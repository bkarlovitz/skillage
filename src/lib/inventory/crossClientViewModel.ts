import { groupCapabilities, sourceLocation } from './capabilityGrouping';
import type { InsightCategory } from './insights';
import { analyzeMcpCrossClient } from './mcpCrossClient';
import { analyzeProjectGlobalShadowing } from './shadowingAnalysis';
import { analyzeTextCapabilityRelationships } from './textCapabilityRelationships';
import type { RelationshipInference, RelationshipLabel } from './relationships';
import type { CapabilityResource, CapabilityResourceType, CapabilityWarningKind } from './types';

export interface CrossClientResourceRow {
  resourceId: string;
  name: string;
  client: string;
  scope: string;
  status: string;
  sourceLocation: string;
  relationshipLabel: RelationshipLabel;
}

export interface CrossClientCapabilityGroup {
  key: string;
  name: string;
  resourceType: CapabilityResourceType;
  clients: string[];
  scopes: string[];
  statuses: string[];
  warningCategories: InsightCategory[];
  sourceLocations: string[];
  relationshipLabel: RelationshipLabel;
  relationships: RelationshipInference[];
  notes: string[];
  rows: CrossClientResourceRow[];
}

export interface CrossClientGroupFilters {
  client?: string;
  resourceType?: string;
  scope?: string;
  status?: string;
  warningCategory?: string;
  relationshipLabel?: string;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function row(resource: CapabilityResource, relationshipLabel: RelationshipLabel): CrossClientResourceRow {
  return {
    resourceId: resource.id,
    name: resource.name,
    client: resource.client,
    scope: resource.scope,
    status: resource.status,
    sourceLocation: sourceLocation(resource),
    relationshipLabel
  };
}

function relationshipCategory(label: RelationshipLabel): InsightCategory | undefined {
  if (label === 'duplicate' || label === 'conflict' || label === 'shadowed' || label === 'overridden' || label === 'needs-review' || label === 'same-name-only') return 'duplication-conflict';
  return undefined;
}

function insightCategory(kind: CapabilityWarningKind): InsightCategory {
  return kind;
}

function warningCategoriesFor(rows: CrossClientResourceRow[], byId: Map<string, CapabilityResource>, relationshipLabel: RelationshipLabel): InsightCategory[] {
  const relationship = relationshipCategory(relationshipLabel);
  return unique([
    ...(relationship ? [relationship] : []),
    ...rows.flatMap((item) => byId.get(item.resourceId)?.warnings.map((warning) => insightCategory(warning.kind)) ?? [])
  ]) as InsightCategory[];
}

function resourcesById(resources: CapabilityResource[]): Map<string, CapabilityResource> {
  return new Map(resources.map((resource) => [resource.id, resource]));
}

function groupFromRows(input: {
  key: string;
  name: string;
  resourceType: CapabilityResourceType;
  rows: CrossClientResourceRow[];
  relationshipLabel: RelationshipLabel;
  warningCategories?: InsightCategory[];
  relationships?: RelationshipInference[];
  notes?: string[];
}): CrossClientCapabilityGroup {
  return {
    key: input.key,
    name: input.name,
    resourceType: input.resourceType,
    clients: unique(input.rows.map((item) => item.client)),
    scopes: unique(input.rows.map((item) => item.scope)),
    statuses: unique(input.rows.map((item) => item.status)),
    warningCategories: input.warningCategories ?? [],
    sourceLocations: unique(input.rows.map((item) => item.sourceLocation)),
    relationshipLabel: input.relationshipLabel,
    relationships: input.relationships ?? [],
    notes: input.notes ?? [],
    rows: input.rows
  };
}

export function buildCrossClientViewModel(resources: CapabilityResource[]): CrossClientCapabilityGroup[] {
  const byId = resourcesById(resources);
  const mcpGroups = analyzeMcpCrossClient(resources)
    .filter((group) => group.instances.length > 1)
    .map((group) => {
      const rows = group.instances.map((instance) => ({
        resourceId: instance.resourceId,
        name: instance.name,
        client: instance.client,
        scope: instance.scope,
        status: instance.status,
        sourceLocation: instance.sourceLocation,
        relationshipLabel: instance.relationshipLabel
      }));
      return groupFromRows({
        key: `mcp:${group.key}`,
        name: group.name,
        resourceType: 'mcp-server',
        relationshipLabel: group.relationshipLabel,
        warningCategories: warningCategoriesFor(rows, byId, group.relationshipLabel),
        relationships: group.relationships,
        notes: group.notes,
        rows
      });
    });
  const textGroups = analyzeTextCapabilityRelationships(resources).map((group) => {
    const rows = group.instances.map((instance) => ({
      resourceId: instance.resourceId,
      name: instance.name,
      client: instance.client,
      scope: instance.scope,
      status: byId.get(instance.resourceId)?.status ?? 'unknown',
      sourceLocation: instance.sourceLocation,
      relationshipLabel: group.relationshipLabel
    }));
    return groupFromRows({
      key: `text:${group.key}`,
      name: group.name,
      resourceType: group.resourceType,
      relationshipLabel: group.relationshipLabel,
      warningCategories: warningCategoriesFor(rows, byId, group.relationshipLabel),
      relationships: group.relationships,
      notes: group.notes,
      rows
    });
  });
  const shadowGroups = analyzeProjectGlobalShadowing(resources).map((analysis) => {
    const projectResource = byId.get(analysis.projectResourceId);
    const broaderResource = byId.get(analysis.broaderResourceId);
    const rows = [projectResource, broaderResource].filter((item): item is CapabilityResource => Boolean(item));
    const viewRows = rows.map((resource) => row(resource, analysis.label));
    return groupFromRows({
      key: `shadow:${analysis.projectResourceId}:${analysis.broaderResourceId}`,
      name: projectResource?.name ?? broaderResource?.name ?? 'shadowing relationship',
      resourceType: projectResource?.resourceType ?? broaderResource?.resourceType ?? 'config-file',
      relationshipLabel: analysis.label,
      warningCategories: warningCategoriesFor(viewRows, byId, analysis.label),
      relationships: [analysis.relationship],
      notes: [analysis.relationship.note],
      rows: viewRows
    });
  });
  const baseGroups = groupCapabilities(resources)
    .filter((group) => group.rows.length > 1 && !['mcp-server', 'skill', 'instruction-file'].includes(group.resourceType))
    .map((group) => {
      const rows = group.rows.map((resource) => row(resource, 'same-name-only'));
      return groupFromRows({
        key: `base:${group.key}`,
        name: group.name,
        resourceType: group.resourceType,
        relationshipLabel: 'same-name-only',
        warningCategories: warningCategoriesFor(rows, byId, 'same-name-only'),
        notes: ['Grouped by shared type/name/source key; no stronger cross-client relationship was inferred.'],
        rows
      });
    });

  return [...mcpGroups, ...textGroups, ...shadowGroups, ...baseGroups]
    .sort((left, right) => left.relationshipLabel.localeCompare(right.relationshipLabel) || left.name.localeCompare(right.name));
}

export function filterCrossClientGroups(groups: CrossClientCapabilityGroup[], filters: CrossClientGroupFilters): CrossClientCapabilityGroup[] {
  return groups.filter((group) => {
    if (filters.client && filters.client !== 'all' && !group.clients.includes(filters.client)) return false;
    if (filters.resourceType && filters.resourceType !== 'all' && group.resourceType !== filters.resourceType) return false;
    if (filters.scope && filters.scope !== 'all' && !group.scopes.includes(filters.scope)) return false;
    if (filters.status && filters.status !== 'all' && !group.statuses.includes(filters.status)) return false;
    if (filters.warningCategory && filters.warningCategory !== 'all' && !group.warningCategories.includes(filters.warningCategory as InsightCategory)) return false;
    if (filters.relationshipLabel && filters.relationshipLabel !== 'all' && group.relationshipLabel !== filters.relationshipLabel) return false;
    return true;
  });
}
