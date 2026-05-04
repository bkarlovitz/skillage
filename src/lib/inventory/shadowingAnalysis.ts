import type { CapabilityResource, CapabilityStatus, CapabilityWarning } from './types';
import type { RelationshipInference, RelationshipLabel } from './relationships';

export interface ShadowingAnalysis {
  label: RelationshipLabel;
  projectResourceId: string;
  broaderResourceId: string;
  shadowedResourceId?: string;
  winnerResourceId?: string;
  relationship: RelationshipInference;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function sourcePath(resource: CapabilityResource): string {
  return resource.path ?? resource.evidence[0]?.sourcePath ?? resource.evidence[0]?.sourceLabel ?? 'unknown source';
}

function isProjectScope(resource: CapabilityResource): boolean {
  return resource.scope === 'project-shared' || resource.scope === 'local-private';
}

function isBroaderScope(resource: CapabilityResource): boolean {
  return resource.scope === 'global' || resource.scope === 'profile';
}

function sameComparableSurface(left: CapabilityResource, right: CapabilityResource): boolean {
  return left.client === right.client
    && left.resourceType === right.resourceType
    && normalizeName(left.name) !== ''
    && normalizeName(left.name) === normalizeName(right.name);
}

function supportedPrecedence(resource: CapabilityResource): boolean {
  if (resource.client === 'openclaw' && resource.resourceType === 'skill') return true;
  if (resource.client === 'claude-code' && resource.resourceType === 'config-file') return true;
  return false;
}

function precedenceRank(resource: CapabilityResource): number | undefined {
  if (!supportedPrecedence(resource)) return undefined;
  if (resource.scope === 'local-private') return 4;
  if (resource.scope === 'project-shared') return 3;
  if (resource.scope === 'profile') return 2;
  if (resource.scope === 'global') return 1;
  return undefined;
}

function relationship(label: RelationshipLabel, projectResource: CapabilityResource, broaderResource: CapabilityResource, note: string): RelationshipInference {
  return {
    label,
    sourceResourceId: projectResource.id,
    targetResourceId: broaderResource.id,
    evidence: label === 'needs-review'
      ? ['same-resource-type', 'same-normalized-name', 'precedence-uncertain']
      : ['same-resource-type', 'same-normalized-name', 'precedence-known'],
    note
  };
}

function warning(message: string, resource: CapabilityResource): CapabilityWarning {
  return {
    kind: 'duplication-conflict',
    severity: 'info',
    message,
    evidence: resource.evidence[0]
  };
}

function uniqueStatuses(statuses: CapabilityStatus[]): CapabilityStatus[] {
  return Array.from(new Set(statuses));
}

function withStatus(resource: CapabilityResource, status: CapabilityStatus): CapabilityResource {
  return {
    ...resource,
    status,
    statuses: uniqueStatuses([resource.status, ...(resource.statuses ?? []), status])
  };
}

export function analyzeProjectGlobalShadowing(resources: CapabilityResource[]): ShadowingAnalysis[] {
  const projectResources = resources.filter(isProjectScope);
  const broaderResources = resources.filter(isBroaderScope);
  const analyses: ShadowingAnalysis[] = [];

  for (const projectResource of projectResources) {
    for (const broaderResource of broaderResources) {
      if (!sameComparableSurface(projectResource, broaderResource)) continue;
      const projectRank = precedenceRank(projectResource);
      const broaderRank = precedenceRank(broaderResource);

      if (projectRank !== undefined && broaderRank !== undefined && projectRank > broaderRank) {
        const note = `${projectResource.client} ${projectResource.resourceType} at ${sourcePath(projectResource)} has higher precedence than ${sourcePath(broaderResource)}.`;
        analyses.push({
          label: projectResource.resourceType === 'config-file' ? 'overridden' : 'shadowed',
          projectResourceId: projectResource.id,
          broaderResourceId: broaderResource.id,
          shadowedResourceId: broaderResource.id,
          winnerResourceId: projectResource.id,
          relationship: relationship(projectResource.resourceType === 'config-file' ? 'overridden' : 'shadowed', projectResource, broaderResource, note)
        });
        continue;
      }

      const note = `Same-name ${projectResource.client} ${projectResource.resourceType} spans project and broader scopes, but precedence is not proven.`;
      analyses.push({
        label: 'needs-review',
        projectResourceId: projectResource.id,
        broaderResourceId: broaderResource.id,
        relationship: relationship('needs-review', projectResource, broaderResource, note)
      });
    }
  }

  return analyses;
}

export function applyProjectGlobalShadowing(resources: CapabilityResource[]): CapabilityResource[] {
  const analyses = analyzeProjectGlobalShadowing(resources);
  if (!analyses.length) return resources;
  const updates = new Map<string, CapabilityResource>();

  for (const analysis of analyses) {
    const projectResource = updates.get(analysis.projectResourceId) ?? resources.find((resource) => resource.id === analysis.projectResourceId);
    const broaderResource = updates.get(analysis.broaderResourceId) ?? resources.find((resource) => resource.id === analysis.broaderResourceId);
    if (!projectResource || !broaderResource) continue;

    if (analysis.label === 'shadowed' && analysis.shadowedResourceId && analysis.winnerResourceId) {
      const shadowed = broaderResource.id === analysis.shadowedResourceId ? broaderResource : projectResource;
      updates.set(shadowed.id, {
        ...withStatus(shadowed, 'shadowed'),
        warnings: [...shadowed.warnings, warning(analysis.relationship.note, shadowed)],
        relationships: [{
          kind: 'shadowed-by',
          targetResourceId: analysis.winnerResourceId,
          note: analysis.relationship.note,
          evidence: shadowed.evidence[0]
        }, ...shadowed.relationships],
        metadata: {
          ...shadowed.metadata,
          precedenceOutcome: 'shadowed',
          shadowedBy: analysis.winnerResourceId
        }
      });
    } else if (analysis.label === 'overridden' && analysis.shadowedResourceId && analysis.winnerResourceId) {
      updates.set(broaderResource.id, {
        ...withStatus(broaderResource, 'overridden'),
        warnings: [...broaderResource.warnings, warning(analysis.relationship.note, broaderResource)],
        metadata: {
          ...broaderResource.metadata,
          precedenceOutcome: 'overridden',
          overriddenBy: analysis.winnerResourceId
        }
      });
      updates.set(projectResource.id, {
        ...projectResource,
        relationships: [{
          kind: 'overrides',
          targetResourceId: broaderResource.id,
          note: analysis.relationship.note,
          evidence: projectResource.evidence[0]
        }, ...projectResource.relationships],
        metadata: {
          ...projectResource.metadata,
          precedenceOutcome: 'overrides'
        }
      });
    } else if (analysis.label === 'needs-review') {
      updates.set(projectResource.id, {
        ...withStatus(projectResource, 'needs-review'),
        warnings: [...projectResource.warnings, warning(analysis.relationship.note, projectResource)],
        metadata: {
          ...projectResource.metadata,
          precedenceOutcome: 'same-name-only'
        }
      });
    }
  }

  return resources.map((resource) => updates.get(resource.id) ?? resource);
}
