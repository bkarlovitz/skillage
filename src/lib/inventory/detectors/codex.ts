import {
  getTomlObjectAtPath,
  parseTomlConfig,
  type ParsedTomlConfig
} from '../config/toml';
import { extractMcpServersFromConfig } from '../mcp';
import type { CapabilityResource, CapabilityResourceType, CapabilityScope, CapabilityStatus } from '../types';
import type { DetectorFile, DetectorResult } from './common';
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

const client = 'codex' as const;
const trustCaveat = 'Project-scoped Codex resources depend on workspace trust and need review before treating them as active.';

function segments(path: string): string[] {
  return normalizePath(path).split('/').filter(Boolean);
}

function isHomeMarkerPath(path: string, marker: '.codex' | '.agents'): boolean {
  const normalized = normalizePath(path);
  if (normalized.startsWith(`~/${marker}/`)) return true;
  const parts = segments(path).map((part) => part.toLowerCase());
  const index = parts.indexOf(marker);
  return (parts[0] === 'home' && index === 2) || (parts[0] === 'users' && index === 2);
}

function isCodexFile(file: DetectorFile): boolean {
  const normalized = comparablePath(file.path);
  const base = basename(file.path);
  return normalized.includes('/.codex/')
    || normalized.includes('/.agents/')
    || normalized.startsWith('/etc/codex/')
    || base === 'AGENTS.md'
    || base === 'AGENTS.override.md';
}

function isSensitiveStore(path: string): boolean {
  const normalized = comparablePath(path);
  const base = basename(path).toLowerCase();
  return normalized.includes('/.codex/')
    && (base.includes('auth') || base.includes('token') || base.includes('credential') || base === '.env');
}

function scopeForPath(path: string): CapabilityScope {
  const normalized = comparablePath(path);
  if (normalized.startsWith('/etc/codex/')) return 'managed-admin';
  if (normalized.includes('/.codex/plugins/cache/') || normalized.includes('/.codex/.tmp/') || normalized.includes('/.agents/plugins/')) return 'plugin-bundled';
  if (normalized.includes('/local/') || basename(path).includes('.local.')) return 'local-private';
  if (isHomeMarkerPath(path, '.codex') || isHomeMarkerPath(path, '.agents')) return 'global';
  return 'project-shared';
}

function resourceTypeForPath(path: string): CapabilityResourceType {
  const normalized = comparablePath(path);
  const base = basename(path);

  if (isSensitiveStore(path)) return 'sensitive-store';
  if (base === 'AGENTS.md' || base === 'AGENTS.override.md') return 'instruction-file';
  if (base === 'SKILL.md') return 'skill';
  if (base === 'hooks.json' || normalized.includes('/hooks/')) return 'hook';
  if (normalized.includes('/.codex/agents/') && base.endsWith('.toml')) return 'custom-agent';
  if (normalized.includes('/.agents/plugins/') && base === 'plugin.json') return 'plugin';
  return 'config-file';
}

function nameFromPath(path: string, resourceType: CapabilityResourceType): string {
  const parts = segments(path);
  if (resourceType === 'skill') return parts[parts.length - 2] ?? 'Codex skill';
  if (resourceType === 'plugin') return parts[parts.length - 2] ?? 'Codex plugin';
  if (resourceType === 'custom-agent') return basename(path).replace(/\.toml$/i, '');
  if (resourceType === 'sensitive-store') return 'Codex auth store';
  if (scopeForPath(path) === 'managed-admin' && resourceType === 'config-file') return 'Codex managed/admin config';
  return basename(path);
}

function trustGated(resourceType: CapabilityResourceType, scope: CapabilityScope): boolean {
  return scope === 'project-shared'
    && (resourceType === 'instruction-file' || resourceType === 'skill' || resourceType === 'hook' || resourceType === 'custom-agent');
}

function statusFor(resourceType: CapabilityResourceType, scope: CapabilityScope): CapabilityStatus {
  if (resourceType === 'sensitive-store') return 'sensitive';
  if (trustGated(resourceType, scope)) return 'needs-review';
  return 'found';
}

function caveatsFor(resourceType: CapabilityResourceType, scope: CapabilityScope, sourceEvidence = evidence({
  path: '',
  scannerRule: 'codex',
  matchedPathPattern: 'codex'
})) {
  return trustGated(resourceType, scope)
    ? [warning('scope-concern', 'warning', trustCaveat, sourceEvidence)]
    : [];
}

function genericResource(file: DetectorFile): CapabilityResource {
  const resourceType = resourceTypeForPath(file.path);
  const scope = scopeForPath(file.path);
  const status = statusFor(resourceType, scope);
  const sourceEvidence = evidence({
    path: file.path,
    scannerRule: 'codex-file',
    matchedPathPattern: basename(file.path),
    parseStatus: resourceType === 'sensitive-store' ? 'skipped' : 'not-applicable'
  });

  return resource({
    id: `${client}:${resourceType}:${stableId(file.path)}`,
    name: nameFromPath(file.path, resourceType),
    description: `Codex ${resourceType} discovered from ${file.path}.`,
    client,
    resourceType,
    scope,
    status,
    statuses: status === 'sensitive'
      ? ['found', 'sensitive']
      : status === 'needs-review'
        ? ['found', 'needs-review']
        : ['found'],
    path: file.path,
    evidence: [sourceEvidence],
    warnings: [
      ...caveatsFor(resourceType, scope, sourceEvidence),
      ...(resourceType === 'sensitive-store' ? [warning('secret-auth-concern', 'info', 'Auth store presence is represented as metadata only.', sourceEvidence)] : [])
    ],
    tags: [resourceType],
    metadata: {
      layer: scope,
      source: 'codex-detector'
    }
  });
}

function configResource(file: DetectorFile, parsed: ParsedTomlConfig): CapabilityResource {
  const scope = scopeForPath(file.path);
  const configEvidence = {
    ...parsed.evidence,
    scannerRule: 'codex-config',
    matchedPathPattern: basename(file.path)
  };

  return resource({
    id: `${client}:config:${stableId(file.path)}`,
    name: nameFromPath(file.path, 'config-file'),
    description: `Codex ${scope} TOML configuration file.`,
    client,
    resourceType: 'config-file',
    scope,
    status: parsed.parseErrors.length ? 'parse-error' : 'found',
    path: file.path,
    evidence: [configEvidence],
    warnings: parsed.warnings,
    tags: ['config'],
    metadata: {
      format: 'toml',
      layer: scope,
      managed: scope === 'managed-admin'
    },
    contentPreview: parsed.contentPreview
  });
}

function derivedTomlResources(file: DetectorFile, parsed: ParsedTomlConfig): CapabilityResource[] {
  const scope = scopeForPath(file.path);
  const resources: CapabilityResource[] = [];
  const hooks = getTomlObjectAtPath(parsed, ['hooks']);
  const agents = getTomlObjectAtPath(parsed, ['agents']);

  if (hooks) {
    for (const name of Object.keys(hooks.value)) {
      const hookEvidence = { ...hooks.evidence, parsedKeyPath: `hooks.${name}` };
      const status = statusFor('hook', scope);
      resources.push(resource({
        id: `${client}:hook:${stableId(file.path)}:${stableId(name)}`,
        name,
        description: `Codex hook configured in ${file.path}.`,
        client,
        resourceType: 'hook',
        scope,
        status,
        statuses: status === 'needs-review' ? ['found', 'needs-review'] : ['found'],
        path: file.path,
        evidence: [hookEvidence],
        warnings: caveatsFor('hook', scope, hookEvidence),
        tags: ['hook']
      }));
    }
  }

  if (agents) {
    for (const name of Object.keys(agents.value)) {
      const agentEvidence = { ...agents.evidence, parsedKeyPath: `agents.${name}` };
      const status = statusFor('custom-agent', scope);
      resources.push(resource({
        id: `${client}:custom-agent:${stableId(file.path)}:${stableId(name)}`,
        name,
        description: `Codex custom agent configured in ${file.path}.`,
        client,
        resourceType: 'custom-agent',
        scope,
        status,
        statuses: status === 'needs-review' ? ['found', 'needs-review'] : ['found'],
        path: file.path,
        evidence: [agentEvidence],
        warnings: caveatsFor('custom-agent', scope, agentEvidence),
        tags: ['agent']
      }));
    }
  }

  return resources;
}

function isTomlConfig(file: DetectorFile): boolean {
  return basename(file.path) === 'config.toml';
}

export function detectCodex(files: DetectorFile[]): DetectorResult {
  const result = emptyDetectorResult();

  for (const file of files.filter(isCodexFile)) {
    if (isSensitiveStore(file.path)) {
      result.resources.push(genericResource(file));
      continue;
    }

    if (isTomlConfig(file) && file.content !== undefined) {
      const parsed = parseTomlConfig({
        client,
        path: file.path,
        content: file.content,
        scannerRule: 'codex-config',
        matchedPathPattern: basename(file.path)
      });
      const scope = scopeForPath(file.path);

      result.resources.push(configResource(file, parsed));
      result.resources.push(...derivedTomlResources(file, parsed));
      result.resources.push(...extractMcpServersFromConfig({
        client,
        scope,
        configPath: file.path,
        document: parsed,
        trustGated: scope === 'project-shared'
      }));
      result.parseErrors.push(...parseErrorsFromConfig(parsed.parseErrors));
      continue;
    }

    result.resources.push(genericResource(file));
  }

  return result;
}
