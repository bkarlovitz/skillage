import { defaultPreviewPolicy } from './preview';
import type { CapabilityClient, CapabilityResource, CapabilityResourceType, CapabilityScope, CapabilityStatus, CapabilityWarning } from './types';
import type { SkillItem, SkillKind, SkillScope, SkillTarget, ValidationIssue } from '../types';

function clientFromSkillTarget(target: SkillTarget): CapabilityClient {
  if (target === 'generic') return 'codex';
  return target;
}

function resourceTypeFromSkillKind(kind: SkillKind): CapabilityResourceType {
  switch (kind) {
    case 'plugin-skill':
      return 'skill';
    case 'instruction':
    case 'memory':
      return 'instruction-file';
    case 'config':
    case 'marketplace':
      return 'config-file';
    case 'agent':
      return 'custom-agent';
    default:
      return kind as CapabilityResourceType;
  }
}

function scopeFromSkillScope(scope: SkillScope): CapabilityScope {
  switch (scope) {
    case 'system':
      return 'managed-admin';
    case 'project':
    case 'sample':
      return 'project-shared';
    case 'workspace':
      return 'local-private';
    case 'plugin':
    case 'cache':
    case 'temporary':
    case 'bundled':
      return 'plugin-bundled';
    default:
      return scope as CapabilityScope;
  }
}

function warningFromIssue(issue: ValidationIssue): CapabilityWarning {
  return {
    kind: issue.severity === 'error' ? 'parse-read-problem' : 'runtime-caveat',
    severity: issue.severity,
    message: issue.message
  };
}

function statusFromIssues(issues: ValidationIssue[]): CapabilityStatus {
  if (issues.some((issue) => issue.severity === 'error' && issue.message.toLowerCase().includes('parse'))) return 'parse-error';
  return 'found';
}

export function capabilityResourceFromSkillItem(item: SkillItem): CapabilityResource {
  const client = clientFromSkillTarget(item.target);
  const resourceType = resourceTypeFromSkillKind(item.kind);
  const scope = scopeFromSkillScope(item.scope);
  const previewPolicy = defaultPreviewPolicy({ resourceType, path: item.path, name: item.name });
  const genericWarning: CapabilityWarning[] = item.target === 'generic'
    ? [{ kind: 'scope-concern', severity: 'info', message: 'Generic skill file mapped to Codex-compatible inventory for v1 display.' }]
    : [];

  return {
    id: item.id,
    name: item.name,
    description: item.description,
    client,
    resourceType,
    scope,
    status: statusFromIssues(item.issues),
    previewPolicy,
    path: item.path,
    evidence: [{
      sourcePath: item.path,
      scannerRule: 'legacy-skill-adapter',
      matchedPathPattern: item.entryFile ?? item.path.split('/').pop() ?? item.path,
      readStatus: 'read',
      parseStatus: item.issues.some((issue) => issue.severity === 'error') ? 'partially-parsed' : 'parsed'
    }],
    warnings: [...item.issues.map(warningFromIssue), ...genericWarning],
    relationships: [],
    tags: item.tags,
    metadata: {
      ...item.metadata,
      legacyKind: item.kind,
      legacyScope: item.scope,
      legacyTarget: item.target
    }
  };
}

export function capabilityResourcesFromSkillItems(items: SkillItem[]): CapabilityResource[] {
  return items.map(capabilityResourceFromSkillItem);
}
