import { buildCapabilityGroupingKeys, launchSignature, sourceLocation } from './capabilityGrouping';
import { inferCapabilityRelationship, strongestRelationshipLabel, type RelationshipInference, type RelationshipLabel } from './relationships';
import type { CapabilityResource, CapabilityStatus } from './types';

export interface McpCrossClientInstance {
  resourceId: string;
  name: string;
  client: string;
  scope: string;
  sourceLocation: string;
  status: CapabilityStatus;
  statuses: CapabilityStatus[];
  relationshipLabel: RelationshipLabel;
  command: string;
  packageHint: string;
  url: string;
  launchSignature: string;
  envReferences: string[];
  fileSecretReferences: string[];
}

export interface McpCrossClientGroup {
  key: string;
  name: string;
  relationshipLabel: RelationshipLabel;
  instances: McpCrossClientInstance[];
  relationships: RelationshipInference[];
  notes: string[];
}

function stringMetadata(resource: CapabilityResource, key: string): string {
  const value = resource.metadata[key];
  return typeof value === 'string' ? value : '';
}

function stringArrayMetadata(resource: CapabilityResource, key: string): string[] {
  const value = resource.metadata[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function metadataSecretFiles(resource: CapabilityResource): string[] {
  return [
    ...stringArrayMetadata(resource, 'envFiles'),
    ...stringArrayMetadata(resource, 'fileSecretRefs'),
    ...stringArrayMetadata(resource, 'secretFiles')
  ];
}

function pairRelationships(rows: CapabilityResource[]): RelationshipInference[] {
  const relationships: RelationshipInference[] = [];

  for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
      relationships.push(inferCapabilityRelationship(rows[leftIndex], rows[rightIndex]));
    }
  }

  return relationships;
}

function labelForResource(resource: CapabilityResource, relationships: RelationshipInference[], groupLabel: RelationshipLabel): RelationshipLabel {
  const related = relationships.filter((relationship) => relationship.sourceResourceId === resource.id || relationship.targetResourceId === resource.id);
  return related.length ? strongestRelationshipLabel(related) : groupLabel;
}

function instanceFor(resource: CapabilityResource, relationships: RelationshipInference[], groupLabel: RelationshipLabel): McpCrossClientInstance {
  return {
    resourceId: resource.id,
    name: resource.name,
    client: resource.client,
    scope: resource.scope,
    sourceLocation: sourceLocation(resource),
    status: resource.status,
    statuses: resource.statuses ?? [resource.status],
    relationshipLabel: labelForResource(resource, relationships, groupLabel),
    command: stringMetadata(resource, 'command'),
    packageHint: stringMetadata(resource, 'package'),
    url: stringMetadata(resource, 'url'),
    launchSignature: launchSignature(resource),
    envReferences: stringArrayMetadata(resource, 'envVars'),
    fileSecretReferences: metadataSecretFiles(resource)
  };
}

function groupNote(label: RelationshipLabel): string {
  if (label === 'duplicate') return 'Matching launch evidence makes this likely duplicated configuration, but runtime health was not tested.';
  if (label === 'same-name-only') return 'Same MCP name alone is weak evidence; review command/package/url before treating these as duplicates.';
  if (label === 'conflict') return 'Same client/scope/name has incompatible launch evidence and should be reviewed.';
  if (label === 'identical') return 'Shared source or identity evidence indicates identical static inventory rows.';
  if (label === 'needs-review') return 'Relationship or activation confidence is uncertain.';
  return 'No duplicate relationship was inferred from static evidence.';
}

export function analyzeMcpCrossClient(resources: CapabilityResource[]): McpCrossClientGroup[] {
  const mcpResources = resources.filter((resource) => resource.resourceType === 'mcp-server');
  const groups = mcpResources.reduce<Record<string, CapabilityResource[]>>((accumulator, resource) => {
    const key = buildCapabilityGroupingKeys(resource).nameKey;
    accumulator[key] = [...(accumulator[key] ?? []), resource];
    return accumulator;
  }, {});

  return Object.entries(groups)
    .map(([key, rows]) => {
      const relationships = pairRelationships(rows);
      const relationshipLabel = strongestRelationshipLabel(relationships);
      return {
        key,
        name: rows[0]?.name ?? key,
        relationshipLabel,
        instances: rows.map((resource) => instanceFor(resource, relationships, relationshipLabel)),
        relationships,
        notes: [groupNote(relationshipLabel)]
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}
