import { groupCapabilities, sourceLocation } from './capabilityGrouping';
import { analyzeMcpCrossClient } from './mcpCrossClient';
import { analyzeProjectGlobalShadowing } from './shadowingAnalysis';
import { analyzeTextCapabilityRelationships } from './textCapabilityRelationships';
import type { RelationshipInference, RelationshipLabel } from './relationships';
import type { CapabilityResource, CapabilityResourceType } from './types';

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
  sourceLocations: string[];
  relationshipLabel: RelationshipLabel;
  relationships: RelationshipInference[];
  notes: string[];
  rows: CrossClientResourceRow[];
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

function resourcesById(resources: CapabilityResource[]): Map<string, CapabilityResource> {
  return new Map(resources.map((resource) => [resource.id, resource]));
}

function groupFromRows(input: {
  key: string;
  name: string;
  resourceType: CapabilityResourceType;
  rows: CrossClientResourceRow[];
  relationshipLabel: RelationshipLabel;
  relationships?: RelationshipInference[];
  notes?: string[];
}): CrossClientCapabilityGroup {
  return {
    key: input.key,
    name: input.name,
    resourceType: input.resourceType,
    clients: unique(input.rows.map((item) => item.client)),
    scopes: unique(input.rows.map((item) => item.scope)),
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
    .map((group) => groupFromRows({
      key: `mcp:${group.key}`,
      name: group.name,
      resourceType: 'mcp-server',
      relationshipLabel: group.relationshipLabel,
      relationships: group.relationships,
      notes: group.notes,
      rows: group.instances.map((instance) => ({
        resourceId: instance.resourceId,
        name: instance.name,
        client: instance.client,
        scope: instance.scope,
        status: instance.status,
        sourceLocation: instance.sourceLocation,
        relationshipLabel: instance.relationshipLabel
      }))
    }));
  const textGroups = analyzeTextCapabilityRelationships(resources).map((group) => groupFromRows({
    key: `text:${group.key}`,
    name: group.name,
    resourceType: group.resourceType,
    relationshipLabel: group.relationshipLabel,
    relationships: group.relationships,
    notes: group.notes,
    rows: group.instances.map((instance) => ({
      resourceId: instance.resourceId,
      name: instance.name,
      client: instance.client,
      scope: instance.scope,
      status: byId.get(instance.resourceId)?.status ?? 'unknown',
      sourceLocation: instance.sourceLocation,
      relationshipLabel: group.relationshipLabel
    }))
  }));
  const shadowGroups = analyzeProjectGlobalShadowing(resources).map((analysis) => {
    const projectResource = byId.get(analysis.projectResourceId);
    const broaderResource = byId.get(analysis.broaderResourceId);
    const rows = [projectResource, broaderResource].filter((item): item is CapabilityResource => Boolean(item));
    return groupFromRows({
      key: `shadow:${analysis.projectResourceId}:${analysis.broaderResourceId}`,
      name: projectResource?.name ?? broaderResource?.name ?? 'shadowing relationship',
      resourceType: projectResource?.resourceType ?? broaderResource?.resourceType ?? 'config-file',
      relationshipLabel: analysis.label,
      relationships: [analysis.relationship],
      notes: [analysis.relationship.note],
      rows: rows.map((resource) => row(resource, analysis.label))
    });
  });
  const baseGroups = groupCapabilities(resources)
    .filter((group) => group.rows.length > 1 && !['mcp-server', 'skill', 'instruction-file'].includes(group.resourceType))
    .map((group) => groupFromRows({
      key: `base:${group.key}`,
      name: group.name,
      resourceType: group.resourceType,
      relationshipLabel: 'same-name-only',
      notes: ['Grouped by shared type/name/source key; no stronger cross-client relationship was inferred.'],
      rows: group.rows.map((resource) => row(resource, 'same-name-only'))
    }));

  return [...mcpGroups, ...textGroups, ...shadowGroups, ...baseGroups]
    .sort((left, right) => left.relationshipLabel.localeCompare(right.relationshipLabel) || left.name.localeCompare(right.name));
}
