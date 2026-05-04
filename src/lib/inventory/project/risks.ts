import type { CapabilityResource, CapabilityWarning } from '../types';

export type ProjectRiskCategory =
  | 'project-mcp-server'
  | 'project-hook-command'
  | 'broad-permission'
  | 'inline-secret'
  | 'executable-config'
  | 'local-private-collaboration'
  | 'shared-committed-file';

export interface ProjectRiskWarning extends CapabilityWarning {
  projectRisk: ProjectRiskCategory;
}

function warning(resource: CapabilityResource, projectRisk: ProjectRiskCategory, message: string, severity: CapabilityWarning['severity'] = 'warning'): ProjectRiskWarning {
  return {
    kind: projectRisk === 'inline-secret' ? 'secret-auth-concern' : 'runtime-caveat',
    severity,
    message,
    evidence: resource.evidence[0],
    projectRisk
  };
}

function metadataStringArray(resource: CapabilityResource, key: string): string[] {
  const value = resource.metadata[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function projectRiskWarnings(resource: CapabilityResource): ProjectRiskWarning[] {
  const warnings: ProjectRiskWarning[] = [];
  const isProjectResource = resource.scope === 'project-shared' || resource.scope === 'local-private';

  if (isProjectResource && resource.resourceType === 'mcp-server') {
    warnings.push(warning(resource, 'project-mcp-server', 'Project MCP servers can run code or connect to external services and need review.'));
  }

  if (isProjectResource && (resource.resourceType === 'hook' || resource.tags.includes('command'))) {
    warnings.push(warning(resource, 'project-hook-command', 'Project hooks or commands can execute local shell commands.'));
  }

  const permissions = metadataStringArray(resource, 'permissions');
  if (resource.resourceType === 'permission'
    || resource.metadata.broadPermissions === true
    || permissions.some((entry) => entry === '*' || entry.toLowerCase().includes('dangerously') || entry.toLowerCase().includes('bash(*)'))) {
    warnings.push(warning(resource, 'broad-permission', 'Broad project permissions can grant more access than collaborators expect.'));
  }

  if (resource.warnings.some((item) => item.kind === 'secret-auth-concern') || metadataStringArray(resource, 'secretKeys').length > 0) {
    warnings.push(warning(resource, 'inline-secret', 'Inline secret-like values were detected and should not be shared without review.'));
  }

  if (isProjectResource && (resource.resourceType === 'config-file' || resource.resourceType === 'mcp-server')
    && (typeof resource.metadata.command === 'string' && resource.metadata.command || resource.metadata.launchKind === 'command')) {
    warnings.push(warning(resource, 'executable-config', 'Project configuration can launch executable commands.'));
  }

  if (resource.scope === 'local-private') {
    warnings.push(warning(resource, 'local-private-collaboration', 'Local/private project files may affect behavior but are not visible to collaborators.', 'info'));
  }

  if (resource.scope === 'project-shared' && resource.metadata.gitFileState === 'tracked') {
    warnings.push(warning(resource, 'shared-committed-file', 'Tracked project resource is likely shared with collaborators.', 'info'));
  }

  return warnings;
}

export function withProjectRiskWarnings(resource: CapabilityResource): CapabilityResource {
  const existingRiskMessages = new Set(resource.warnings.map((item) => item.message));
  const riskWarnings = projectRiskWarnings(resource).filter((item) => !existingRiskMessages.has(item.message));
  if (!riskWarnings.length) return resource;

  return {
    ...resource,
    warnings: [...resource.warnings, ...riskWarnings],
    metadata: {
      ...resource.metadata,
      projectRiskCategories: Array.from(new Set([
        ...metadataStringArray(resource, 'projectRiskCategories'),
        ...riskWarnings.map((item) => item.projectRisk)
      ]))
    }
  };
}
