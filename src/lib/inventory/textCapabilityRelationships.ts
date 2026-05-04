import { sourceLocation } from './capabilityGrouping';
import { inferCapabilityRelationship, strongestRelationshipLabel, type RelationshipInference, type RelationshipLabel } from './relationships';
import type { CapabilityResource, CapabilityResourceType } from './types';

export interface TextCapabilityInstance {
  resourceId: string;
  name: string;
  client: string;
  scope: string;
  sourceLocation: string;
  scannerRule: string;
  matchedPathPattern: string;
}

export interface TextCapabilityRelationshipGroup {
  key: string;
  resourceType: CapabilityResourceType;
  name: string;
  relationshipLabel: RelationshipLabel;
  instances: TextCapabilityInstance[];
  relationships: RelationshipInference[];
  notes: string[];
}

const supportedTypes = new Set<CapabilityResourceType>(['skill', 'instruction-file']);

function keyForPair(left: CapabilityResource, right: CapabilityResource): string {
  return `${left.id}::${right.id}`;
}

function pairRelationships(rows: CapabilityResource[]): RelationshipInference[] {
  const relationships: RelationshipInference[] = [];

  for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
      const relationship = inferCapabilityRelationship(rows[leftIndex], rows[rightIndex]);
      if (relationship.label !== 'no-relationship-inferred') relationships.push(relationship);
    }
  }

  return relationships;
}

function connectedComponents(rows: CapabilityResource[], relationships: RelationshipInference[]): CapabilityResource[][] {
  const parent = new Map(rows.map((row) => [row.id, row.id]));
  const byId = new Map(rows.map((row) => [row.id, row]));

  function find(id: string): string {
    const current = parent.get(id) ?? id;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  }

  function union(left: string, right: string) {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  }

  for (const relationship of relationships) {
    if (relationship.sourceResourceId && relationship.targetResourceId) union(relationship.sourceResourceId, relationship.targetResourceId);
  }

  const groups = new Map<string, CapabilityResource[]>();
  for (const row of rows) {
    const root = find(row.id);
    groups.set(root, [...(groups.get(root) ?? []), byId.get(row.id) ?? row]);
  }

  return Array.from(groups.values()).filter((group) => group.length > 1);
}

function instance(resource: CapabilityResource): TextCapabilityInstance {
  const evidence = resource.evidence[0];
  return {
    resourceId: resource.id,
    name: resource.name,
    client: resource.client,
    scope: resource.scope,
    sourceLocation: sourceLocation(resource),
    scannerRule: evidence?.scannerRule ?? 'unknown',
    matchedPathPattern: evidence?.matchedPathPattern ?? 'unknown'
  };
}

function notesFor(label: RelationshipLabel, rows: CapabilityResource[], relationships: RelationshipInference[]): string[] {
  const notes = new Set<string>();
  const sourceCount = new Set(rows.map(sourceLocation)).size;

  if (label === 'identical') notes.add('Shared source or identity evidence supports an identical static relationship.');
  if (label === 'similar') notes.add('Similarity is based on shared description or launch evidence, not guaranteed behavior.');
  if (label === 'same-name-only') notes.add('Shared name alone is not enough to infer identical behavior.');
  if (sourceCount > 1) notes.add('Source evidence diverges across clients or locations.');
  for (const relationship of relationships) notes.add(relationship.note);

  return Array.from(notes);
}

export function analyzeTextCapabilityRelationships(resources: CapabilityResource[]): TextCapabilityRelationshipGroup[] {
  const rows = resources.filter((resource) => supportedTypes.has(resource.resourceType));
  const relationships = pairRelationships(rows);
  const components = connectedComponents(rows, relationships);

  return components.map((component) => {
    const ids = new Set(component.map((row) => row.id));
    const componentRelationships = relationships.filter((relationship) => relationship.sourceResourceId && relationship.targetResourceId
      && ids.has(relationship.sourceResourceId)
      && ids.has(relationship.targetResourceId));
    const relationshipLabel = strongestRelationshipLabel(componentRelationships);

    return {
      key: component.map((row) => row.id).sort().join('::') || keyForPair(component[0], component[1]),
      resourceType: component[0].resourceType,
      name: component[0].name,
      relationshipLabel,
      instances: component.map(instance),
      relationships: componentRelationships,
      notes: notesFor(relationshipLabel, component, componentRelationships)
    };
  }).sort((left, right) => left.resourceType.localeCompare(right.resourceType) || left.name.localeCompare(right.name));
}
