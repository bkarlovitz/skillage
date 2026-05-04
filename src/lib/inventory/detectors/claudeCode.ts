import {
  getJsonObjectAtPath,
  parseJsonConfig,
  type ParsedJsonConfig
} from '../config/json';
import { extractMcpServersFromConfig } from '../mcp';
import { classifyProjectPathScope } from '../project/scope';
import type { SelectedProjectContext } from '../scan';
import type { CapabilityResource, CapabilityResourceType, CapabilityScope, CapabilityStatus } from '../types';
import type { DetectorFile, DetectorOptions, DetectorResult } from './common';
import {
  basename,
  comparablePath,
  emptyDetectorResult,
  evidence,
  normalizePath,
  parseErrorsFromConfig,
  resource,
  stableId,
  warning
} from './common';

const client = 'claude-code' as const;
const trustCaveat = 'Project-scoped Claude Code resources depend on project trust and need review before treating them as active.';

function segments(path: string): string[] {
  return normalizePath(path).split('/').filter(Boolean);
}

function isClaudeCodeFile(file: DetectorFile): boolean {
  const normalized = comparablePath(file.path);
  const base = basename(file.path);
  return normalized.includes('/.claude/')
    || normalized.endsWith('/.claude')
    || base === 'CLAUDE.md'
    || base === 'CLAUDE.local.md';
}

function isHomeClaudePath(path: string): boolean {
  const normalized = normalizePath(path);
  if (normalized.startsWith('~/.claude/')) return true;
  const parts = segments(path).map((part) => part.toLowerCase());
  const index = parts.indexOf('.claude');
  return (parts[0] === 'home' && index === 2) || (parts[0] === 'users' && index === 2);
}

function scopeForPath(path: string, projectContext?: SelectedProjectContext): CapabilityScope {
  const normalized = comparablePath(path);
  const base = basename(path);
  if (base === 'settings.local.json' || base === 'CLAUDE.local.md' || normalized.includes('/local/')) return 'local-private';
  if (normalized.includes('/.claude/plugins/')) return 'plugin-bundled';
  if (projectContext) {
    const classification = classifyProjectPathScope(path, projectContext);
    if (classification.scope !== 'unknown') return classification.scope;
  }
  if (isHomeClaudePath(path)) return 'global';
  return 'project-shared';
}

function nameFromParent(path: string): string {
  const parts = segments(path);
  return parts[parts.length - 2] ?? basename(path);
}

function commandName(path: string): string {
  return basename(path).replace(/\.(md|mdc)$/i, '');
}

function resourceTypeForPath(path: string): CapabilityResourceType {
  const normalized = comparablePath(path);
  const base = basename(path);

  if (base === 'settings.json' || base === 'settings.local.json' || base === 'mcp.json') return 'config-file';
  if (base === 'hooks.json' || normalized.includes('/hooks/')) return 'hook';
  if (base === 'plugin.json') return 'plugin';
  if (base === 'SKILL.md') return 'skill';
  if (normalized.includes('/commands/') && base.endsWith('.md')) return 'instruction-file';
  if (normalized.includes('/agents/') && base.endsWith('.md')) return 'custom-agent';
  if (base === 'CLAUDE.md' || base === 'CLAUDE.local.md') return 'instruction-file';
  return 'config-file';
}

function statusForTrust(scope: CapabilityScope, resourceType: CapabilityResourceType): CapabilityStatus {
  if (scope === 'project-shared' && (resourceType === 'skill' || resourceType === 'hook')) return 'needs-review';
  return 'found';
}

function caveatsFor(scope: CapabilityScope, resourceType: CapabilityResourceType, sourceEvidence = evidence({
  path: '',
  scannerRule: 'claude-code',
  matchedPathPattern: '.claude'
})) {
  return scope === 'project-shared' && (resourceType === 'skill' || resourceType === 'hook')
    ? [warning('scope-concern', 'warning', trustCaveat, sourceEvidence)]
    : [];
}

function genericResource(file: DetectorFile, projectContext?: SelectedProjectContext): CapabilityResource {
  const resourceType = resourceTypeForPath(file.path);
  const scope = scopeForPath(file.path, projectContext);
  const sourceEvidence = evidence({
    path: file.path,
    scannerRule: 'claude-code-file',
    matchedPathPattern: basename(file.path)
  });
  const status = statusForTrust(scope, resourceType);

  return resource({
    id: `${client}:${resourceType}:${stableId(file.path)}`,
    name: resourceType === 'skill'
      ? nameFromParent(file.path)
      : resourceType === 'instruction-file' && comparablePath(file.path).includes('/commands/')
        ? commandName(file.path)
        : basename(file.path),
    description: `Claude Code ${resourceType} discovered from ${file.path}.`,
    client,
    resourceType,
    scope,
    status,
    statuses: status === 'needs-review' ? ['found', 'needs-review'] : ['found'],
    path: file.path,
    evidence: [sourceEvidence],
    warnings: caveatsFor(scope, resourceType, sourceEvidence),
    tags: comparablePath(file.path).includes('/commands/') ? ['command'] : [resourceType],
    metadata: {
      source: 'claude-code-detector'
    }
  });
}

function configResource(file: DetectorFile, parsed: ParsedJsonConfig, projectContext?: SelectedProjectContext): CapabilityResource {
  const scope = scopeForPath(file.path, projectContext);
  const configEvidence = {
    ...parsed.evidence,
    scannerRule: 'claude-code-config',
    matchedPathPattern: basename(file.path)
  };

  return resource({
    id: `${client}:config:${stableId(file.path)}`,
    name: basename(file.path),
    description: `Claude Code ${scope} configuration file.`,
    client,
    resourceType: 'config-file',
    scope,
    status: parsed.parseErrors.length ? 'parse-error' : 'found',
    path: file.path,
    evidence: [configEvidence],
    warnings: parsed.warnings,
    tags: ['config'],
    metadata: {
      format: 'json',
      localPrivate: scope === 'local-private'
    },
    contentPreview: parsed.contentPreview
  });
}

function derivedConfigResources(file: DetectorFile, parsed: ParsedJsonConfig, projectContext?: SelectedProjectContext): CapabilityResource[] {
  const scope = scopeForPath(file.path, projectContext);
  const resources: CapabilityResource[] = [];
  const hooks = getJsonObjectAtPath(parsed, ['hooks']);
  const permissions = getJsonObjectAtPath(parsed, ['permissions']);

  if (hooks) {
    for (const name of Object.keys(hooks.value)) {
      const hookEvidence = {
        ...hooks.evidence,
        parsedKeyPath: `hooks.${name}`
      };
      const status = statusForTrust(scope, 'hook');
      resources.push(resource({
        id: `${client}:hook:${stableId(file.path)}:${stableId(name)}`,
        name,
        description: `Claude Code hook configured in ${file.path}.`,
        client,
        resourceType: 'hook',
        scope,
        status,
        statuses: status === 'needs-review' ? ['found', 'needs-review'] : ['found'],
        path: file.path,
        evidence: [hookEvidence],
        warnings: caveatsFor(scope, 'hook', hookEvidence),
        tags: ['hook']
      }));
    }
  }

  if (permissions) {
    resources.push(resource({
      id: `${client}:permission:${stableId(file.path)}`,
      name: 'Claude Code permissions',
      description: `Claude Code permission-like settings in ${file.path}.`,
      client,
      resourceType: 'permission',
      scope,
      path: file.path,
      evidence: [permissions.evidence],
      tags: ['permissions']
    }));
  }

  return resources;
}

function isJsonConfig(file: DetectorFile): boolean {
  const base = basename(file.path);
  return base === 'settings.json' || base === 'settings.local.json' || base === 'mcp.json';
}

export function detectClaudeCode(files: DetectorFile[], options: DetectorOptions = {}): DetectorResult {
  const result = emptyDetectorResult();
  const { projectContext } = options;

  for (const file of files.filter(isClaudeCodeFile)) {
    if (isJsonConfig(file) && file.content !== undefined) {
      const parsed = parseJsonConfig({
        client,
        path: file.path,
        content: file.content,
        scannerRule: 'claude-code-config',
        matchedPathPattern: basename(file.path)
      });
      const scope = scopeForPath(file.path, projectContext);
      const trustGated = scope === 'project-shared';

      result.resources.push(configResource(file, parsed, projectContext));
      result.resources.push(...derivedConfigResources(file, parsed, projectContext));
      result.resources.push(...extractMcpServersFromConfig({
        client,
        scope,
        configPath: file.path,
        document: parsed,
        trustGated
      }));
      result.parseErrors.push(...parseErrorsFromConfig(parsed.parseErrors));
      continue;
    }

    result.resources.push(genericResource(file, projectContext));
  }

  return result;
}
