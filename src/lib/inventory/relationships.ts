import type { CapabilityRelationship, CapabilityResource } from './types';

export const relationshipLabels = [
  'identical',
  'similar',
  'same-name-only',
  'shadowed',
  'overridden',
  'conflict',
  'duplicate',
  'needs-review',
  'no-relationship-inferred'
] as const;

export type RelationshipLabel = typeof relationshipLabels[number];

export type RelationshipEvidenceKind =
  | 'explicit-relationship'
  | 'same-source-path'
  | 'same-identity-key'
  | 'same-launch-signature'
  | 'same-normalized-name'
  | 'same-resource-type'
  | 'same-client'
  | 'same-scope'
  | 'different-launch-signature'
  | 'precedence-known'
  | 'precedence-uncertain'
  | 'similar-description'
  | 'needs-review-status';

export interface RelationshipInference {
  label: RelationshipLabel;
  evidence: RelationshipEvidenceKind[];
  note: string;
  sourceResourceId?: string;
  targetResourceId?: string;
}

const orderedLabels = new Map<RelationshipLabel, number>(relationshipLabels.map((label, index) => [label, index]));

function normalizeText(value: string | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizedName(resource: CapabilityResource): string {
  return normalizeText(resource.name);
}

function sourcePath(resource: CapabilityResource): string {
  return resource.path ?? resource.evidence[0]?.sourcePath ?? resource.evidence[0]?.sourceLabel ?? '';
}

function normalizedSourcePath(resource: CapabilityResource): string {
  return sourcePath(resource).replace(/\\/g, '/').toLowerCase();
}

function stringMetadata(resource: CapabilityResource, key: string): string {
  const value = resource.metadata[key];
  return typeof value === 'string' ? value.trim() : '';
}

function stringArrayMetadata(resource: CapabilityResource, key: string): string[] {
  const value = resource.metadata[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function launchSignature(resource: CapabilityResource): string {
  const command = stringMetadata(resource, 'command');
  const packageHint = stringMetadata(resource, 'package');
  const url = stringMetadata(resource, 'url');
  const args = stringArrayMetadata(resource, 'args').join(' ');
  return normalizeText([command, packageHint, url, args].filter(Boolean).join(' '));
}

function identityKey(resource: CapabilityResource): string {
  return stringMetadata(resource, 'identityKey') || stringMetadata(resource, 'sourceKeyPath');
}

function hasStatus(resource: CapabilityResource, status: string): boolean {
  return resource.status === status || (resource.statuses ?? []).includes(status as CapabilityResource['status']);
}

function explicitRelationship(left: CapabilityResource, right: CapabilityResource, kinds: CapabilityRelationship['kind'][]): CapabilityRelationship | undefined {
  return left.relationships.find((relationship) => relationship.targetResourceId === right.id && kinds.includes(relationship.kind))
    ?? right.relationships.find((relationship) => relationship.targetResourceId === left.id && kinds.includes(relationship.kind));
}

function sharedDescriptionTerms(left: CapabilityResource, right: CapabilityResource): boolean {
  const leftTerms = new Set(normalizeText(left.description).split(' ').filter((term) => term.length > 4));
  const rightTerms = normalizeText(right.description).split(' ').filter((term) => term.length > 4);
  return rightTerms.some((term) => leftTerms.has(term));
}

function inference(label: RelationshipLabel, evidence: RelationshipEvidenceKind[], note: string, left: CapabilityResource, right: CapabilityResource): RelationshipInference {
  return {
    label,
    evidence,
    note,
    sourceResourceId: left.id,
    targetResourceId: right.id
  };
}

function sameTypeAndName(left: CapabilityResource, right: CapabilityResource): boolean {
  return left.resourceType === right.resourceType && normalizedName(left) !== '' && normalizedName(left) === normalizedName(right);
}

function explicitShadowed(left: CapabilityResource, right: CapabilityResource): boolean {
  return Boolean(explicitRelationship(left, right, ['shadowed-by']))
    || stringMetadata(left, 'shadowedBy') === right.id
    || stringMetadata(right, 'shadowedBy') === left.id
    || hasStatus(left, 'shadowed')
    || hasStatus(right, 'shadowed');
}

function explicitOverridden(left: CapabilityResource, right: CapabilityResource): boolean {
  return Boolean(explicitRelationship(left, right, ['overrides']))
    || hasStatus(left, 'overridden')
    || hasStatus(right, 'overridden');
}

function uncertainPrecedence(left: CapabilityResource, right: CapabilityResource): boolean {
  return stringMetadata(left, 'precedenceOutcome') === 'same-name-only'
    || stringMetadata(right, 'precedenceOutcome') === 'same-name-only'
    || hasStatus(left, 'needs-review')
    || hasStatus(right, 'needs-review');
}

function labelFromExplicitDuplicate(left: CapabilityResource, right: CapabilityResource): RelationshipInference | undefined {
  const duplicate = explicitRelationship(left, right, ['duplicates']);
  if (duplicate) {
    return inference('duplicate', ['explicit-relationship'], duplicate.note ?? 'Explicit duplicate relationship evidence exists.', left, right);
  }
  const similar = explicitRelationship(left, right, ['similar-to']);
  if (similar) {
    return inference('similar', ['explicit-relationship'], similar.note ?? 'Explicit similar relationship evidence exists.', left, right);
  }
  return undefined;
}

export function inferCapabilityRelationship(left: CapabilityResource, right: CapabilityResource): RelationshipInference {
  if (left.id === right.id) {
    return inference('identical', ['same-identity-key'], 'The resource was compared with itself.', left, right);
  }

  const explicitDuplicate = labelFromExplicitDuplicate(left, right);
  if (explicitDuplicate) return explicitDuplicate;

  if (explicitShadowed(left, right)) {
    return inference('shadowed', ['explicit-relationship', 'precedence-known'], 'One resource is explicitly marked shadowed by higher-precedence evidence.', left, right);
  }

  if (explicitOverridden(left, right)) {
    return inference('overridden', ['explicit-relationship', 'precedence-known'], 'One resource is explicitly marked as overriding another resource.', left, right);
  }

  const sameType = left.resourceType === right.resourceType;
  const sameName = sameTypeAndName(left, right);
  const leftSource = normalizedSourcePath(left);
  const rightSource = normalizedSourcePath(right);
  const sameSource = Boolean(leftSource && rightSource && leftSource === rightSource);
  const leftIdentity = identityKey(left);
  const rightIdentity = identityKey(right);
  const sameIdentity = Boolean(leftIdentity && rightIdentity && leftIdentity === rightIdentity);
  const leftLaunch = launchSignature(left);
  const rightLaunch = launchSignature(right);
  const sameLaunch = Boolean(leftLaunch && rightLaunch && leftLaunch === rightLaunch);
  const differentLaunch = Boolean(leftLaunch && rightLaunch && leftLaunch !== rightLaunch);

  if (sameType && sameName && (sameSource || sameIdentity)) {
    return inference('identical', ['same-resource-type', 'same-normalized-name', sameSource ? 'same-source-path' : 'same-identity-key'], 'Same type/name with shared source or explicit identity evidence.', left, right);
  }

  if (sameType && sameName && left.client === right.client && left.scope === right.scope && differentLaunch) {
    return inference('conflict', ['same-resource-type', 'same-normalized-name', 'same-client', 'same-scope', 'different-launch-signature'], 'Same client/scope/type/name has incompatible launch evidence.', left, right);
  }

  if (sameType && sameName && sameLaunch) {
    return inference('duplicate', ['same-resource-type', 'same-normalized-name', 'same-launch-signature'], 'Same type/name with matching launch evidence appears in more than one resource.', left, right);
  }

  if (sameType && !sameName && sameLaunch) {
    return inference('similar', ['same-resource-type', 'same-launch-signature'], 'Different names share the same launch evidence, so they are similar but not identical.', left, right);
  }

  if (sameName && uncertainPrecedence(left, right)) {
    return inference('needs-review', ['same-resource-type', 'same-normalized-name', 'precedence-uncertain', 'needs-review-status'], 'Same-name resources need review because precedence or activation is uncertain.', left, right);
  }

  if (sameType && !sameName && sharedDescriptionTerms(left, right)) {
    return inference('similar', ['same-resource-type', 'similar-description'], 'Resources share descriptive terms but lack enough evidence for duplicate or identical labels.', left, right);
  }

  if (sameName) {
    return inference('same-name-only', ['same-resource-type', 'same-normalized-name'], 'Shared name is weak evidence and is not enough to infer identity or conflict.', left, right);
  }

  return inference('no-relationship-inferred', [], 'No relationship was inferred from available static evidence.', left, right);
}

export function strongestRelationshipLabel(relationships: RelationshipInference[]): RelationshipLabel {
  return relationships.reduce<RelationshipLabel>((strongest, item) => {
    const left = orderedLabels.get(item.label) ?? relationshipLabels.length;
    const right = orderedLabels.get(strongest) ?? relationshipLabels.length;
    return left < right ? item.label : strongest;
  }, 'no-relationship-inferred');
}
