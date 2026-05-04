import type { SelectedProjectContext } from '../scan';
import type { CapabilityResource, CapabilityStatus, CapabilityWarning } from '../types';

export interface ProjectInheritanceResult {
  resources: CapabilityResource[];
  inheritedResources: CapabilityResource[];
  caveats: string[];
}

function uniqueStatuses(statuses: CapabilityStatus[]): CapabilityStatus[] {
  return Array.from(new Set(statuses));
}

function resourceStatuses(resource: CapabilityResource, extra: CapabilityStatus[]): CapabilityStatus[] {
  return uniqueStatuses([resource.status, ...(resource.statuses ?? []), ...extra]);
}

function caveatForInherited(resource: CapabilityResource, context: SelectedProjectContext): string {
  if (resource.client === 'hermes' && resource.scope === 'profile') {
    const profileName = typeof resource.metadata.profileName === 'string' ? resource.metadata.profileName : 'profile';
    return context.activeProfile === profileName
      ? `Hermes ${profileName} profile resources are likely inherited when that profile is active.`
      : `Hermes ${profileName} profile inheritance depends on the active Hermes profile.`;
  }

  if (resource.resourceType === 'mcp-server') {
    return 'Global MCP inheritance depends on client runtime, profile, current working directory, and client-specific enablement.';
  }

  return 'Inherited resource activation depends on client behavior and runtime state.';
}

function activationConfidenceForInherited(resource: CapabilityResource, context: SelectedProjectContext): CapabilityStatus {
  if (resource.client === 'hermes' && resource.scope === 'profile' && context.activeProfile === resource.metadata.profileName) return 'likely-active';
  return 'unknown';
}

function caveatWarning(message: string, resource: CapabilityResource): CapabilityWarning {
  return {
    kind: 'runtime-caveat',
    severity: 'info',
    message,
    evidence: resource.evidence[0]
  };
}

export function inheritedProjectResource(resource: CapabilityResource, context: SelectedProjectContext): CapabilityResource {
  const caveat = caveatForInherited(resource, context);
  const activationConfidence = activationConfidenceForInherited(resource, context);

  return {
    ...resource,
    id: `inherited:${resource.id}`,
    status: 'inherited',
    statuses: resourceStatuses(resource, ['inherited', activationConfidence]),
    warnings: [...resource.warnings, caveatWarning(caveat, resource)],
    relationships: [{
      kind: 'inherits-from',
      targetResourceId: resource.id,
      note: caveat,
      evidence: resource.evidence[0]
    }, ...resource.relationships],
    tags: Array.from(new Set([...resource.tags, 'inherited'])),
    metadata: {
      ...resource.metadata,
      inherited: true,
      inheritedFromScope: resource.scope,
      activationConfidence,
      inheritanceCaveats: [caveat]
    }
  };
}

export function annotateProjectLayerCaveats(resource: CapabilityResource, context: SelectedProjectContext): CapabilityResource {
  if (resource.client !== 'codex' || resource.scope !== 'project-shared') return resource;

  const caveat = context.trustState === 'trusted'
    ? 'Codex project resources are in a trusted project, but activation still depends on the active Codex runtime.'
    : 'Codex project resources are trust-gated until the selected project is trusted by the client.';

  return {
    ...resource,
    statuses: resourceStatuses(resource, ['needs-review']),
    warnings: resource.warnings.some((warning) => warning.message === caveat)
      ? resource.warnings
      : [...resource.warnings, caveatWarning(caveat, resource)],
    metadata: {
      ...resource.metadata,
      projectLayer: 'trust-gated',
      activationConfidence: context.trustState === 'trusted' ? 'likely-active' : 'trust-gated',
      inheritanceCaveats: [
        ...(Array.isArray(resource.metadata.inheritanceCaveats) ? resource.metadata.inheritanceCaveats : []),
        caveat
      ]
    }
  };
}

export function joinInheritedProjectResources(input: {
  projectResources: CapabilityResource[];
  inheritedCandidates: CapabilityResource[];
  context: SelectedProjectContext;
}): ProjectInheritanceResult {
  const projectResources = input.projectResources.map((resource) => annotateProjectLayerCaveats(resource, input.context));
  const inheritedResources = input.inheritedCandidates
    .filter((resource) => resource.scope === 'global' || resource.scope === 'profile')
    .map((resource) => inheritedProjectResource(resource, input.context));

  return {
    resources: [...projectResources, ...inheritedResources],
    inheritedResources,
    caveats: inheritedResources.flatMap((resource) => {
      const caveats = resource.metadata.inheritanceCaveats;
      return Array.isArray(caveats) ? caveats.map(String) : [];
    })
  };
}
