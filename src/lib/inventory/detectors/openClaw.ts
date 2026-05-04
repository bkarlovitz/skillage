import { getJsonObjectAtPath, getJsonValueAtPath, parseJsonConfig, type JsonObject, type JsonValue, type ParsedJsonConfig } from '../config/json';
import { extractMcpServersFromConfig } from '../mcp';
import type { CapabilityEvidence, CapabilityResource, CapabilityResourceType, CapabilityScope } from '../types';
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

const client = 'openclaw' as const;

function segments(path: string): string[] {
  return normalizePath(path).split('/').filter(Boolean);
}

function openClawIndex(path: string): number {
  return segments(path).findIndex((part) => part.toLowerCase() === '.openclaw');
}

function isOpenClawFile(file: DetectorFile): boolean {
  const normalized = comparablePath(file.path);
  return normalized.includes('/.openclaw/') || basename(file.path) === 'openclaw.json';
}

function openClawRoot(path: string): string {
  const parts = segments(path);
  const index = openClawIndex(path);
  if (index < 0) return normalizePath(path).split('/').slice(0, -1).join('/');
  return `${path.startsWith('/') ? '/' : ''}${parts.slice(0, index + 1).join('/')}`;
}

function namedSegment(path: string, marker: string): string | undefined {
  const parts = segments(path);
  const lower = parts.map((part) => part.toLowerCase());
  const index = lower.indexOf(marker.toLowerCase());
  return index >= 0 ? parts[index + 1] : undefined;
}

function scopeForPath(path: string): CapabilityScope {
  const normalized = comparablePath(path);
  if (normalized.includes('/profiles/')) return 'profile';
  if (normalized.includes('/workspaces/')) return 'local-private';
  if (normalized.includes('/plugins/') || normalized.includes('/extensions/')) return 'plugin-bundled';
  return 'global';
}

function dirname(path: string): string {
  const normalized = normalizePath(path);
  return normalized.split('/').slice(0, -1).join('/') || '/';
}

function resolveRelative(basePath: string, includePath: string): string {
  if (includePath.startsWith('/') || includePath.startsWith('~') || /^[A-Za-z]:/.test(includePath)) return normalizePath(includePath);
  const stack = dirname(basePath).split('/').filter(Boolean);
  for (const part of includePath.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return `${basePath.startsWith('/') ? '/' : ''}${stack.join('/')}`;
}

function resourceTypeForPath(path: string): CapabilityResourceType {
  const normalized = comparablePath(path);
  const base = basename(path);
  if (normalized.includes('/imports/') || normalized.includes('/migration')) return 'migration-import-source';
  if (normalized.includes('/agents/')) return 'custom-agent';
  if (base === 'SKILL.md' || normalized.includes('/skills/')) return 'skill';
  if (normalized.includes('/plugins/') || normalized.includes('/extensions/')) return 'plugin';
  return 'config-file';
}

function nameForPath(path: string, resourceType: CapabilityResourceType): string {
  if (resourceType === 'custom-agent') return basename(path).replace(/\.(json|md)$/i, '');
  if (resourceType === 'skill') return namedSegment(path, 'skills') ?? basename(path);
  if (resourceType === 'plugin') return namedSegment(path, 'plugins') ?? namedSegment(path, 'extensions') ?? basename(path);
  if (resourceType === 'migration-import-source') return namedSegment(path, 'imports') ?? basename(path);
  return basename(path);
}

function genericResource(file: DetectorFile, sourceEvidence?: CapabilityEvidence): CapabilityResource {
  const resourceType = resourceTypeForPath(file.path);
  const itemEvidence = sourceEvidence ?? evidence({
    path: file.path,
    scannerRule: `openclaw-${resourceType}`,
    matchedPathPattern: basename(file.path)
  });

  return resource({
    id: `${client}:${resourceType}:${stableId(file.path)}:${stableId(itemEvidence.includedFromPath ?? '')}`,
    name: nameForPath(file.path, resourceType),
    description: `OpenClaw ${resourceType} discovered from ${file.path}.`,
    client,
    resourceType,
    scope: scopeForPath(file.path),
    path: file.path,
    evidence: [itemEvidence],
    tags: [resourceType],
    metadata: {
      profileName: namedSegment(file.path, 'profiles') ?? '',
      workspaceName: namedSegment(file.path, 'workspaces') ?? '',
      includedFromPath: itemEvidence.includedFromPath ?? ''
    }
  });
}

function configResource(file: DetectorFile, parsed: ParsedJsonConfig): CapabilityResource {
  return {
    ...genericResource(file),
    status: parsed.parseErrors.length ? 'parse-error' : 'found',
    contentPreview: parsed.contentPreview,
    warnings: parsed.warnings
  };
}

function firstObjectAtPath(parsed: ParsedJsonConfig, paths: Array<readonly string[]>): { value: JsonObject; evidence: CapabilityEvidence } | undefined {
  for (const path of paths) {
    const result = getJsonObjectAtPath(parsed, path);
    if (result) return result;
  }
  return undefined;
}

function mcpField(object: JsonObject, key: string): string {
  const value = object[key];
  return typeof value === 'string' ? value : '';
}

function mcpRoleResource(input: {
  file: DetectorFile;
  parsed: ParsedJsonConfig;
  configResourceId: string;
  role: 'exposed' | 'unknown';
  object: JsonObject;
  evidence: CapabilityEvidence;
}): CapabilityResource {
  const needsReview = input.role === 'unknown';
  const sourceEvidence = input.evidence;

  return resource({
    id: `${client}:mcp-${input.role}:${stableId(input.file.path)}`,
    name: input.role === 'exposed' ? 'OpenClaw exposed MCP server' : 'OpenClaw MCP role',
    description: input.role === 'exposed'
      ? 'OpenClaw appears configured to expose an MCP server to other clients.'
      : 'OpenClaw MCP configuration exists, but the consumed/exposed role is ambiguous.',
    client,
    resourceType: 'mcp-server',
    scope: scopeForPath(input.file.path),
    status: needsReview ? 'needs-review' : 'not-tested',
    statuses: needsReview ? ['found', 'not-tested', 'needs-review'] : ['found', 'not-tested'],
    path: input.file.path,
    evidence: [sourceEvidence],
    warnings: [
      warning(
        'runtime-caveat',
        needsReview ? 'warning' : 'info',
        needsReview
          ? 'OpenClaw MCP role cannot be proven from this config and needs review.'
          : 'OpenClaw exposed MCP server was not started or connectivity-tested.',
        sourceEvidence
      )
    ],
    tags: ['mcp'],
    metadata: {
      mcpRole: input.role,
      command: mcpField(input.object, 'command'),
      url: mcpField(input.object, 'url') || mcpField(input.object, 'endpoint'),
      configured: true,
      tested: false
    }
  });
}

function mcpResourcesForConfig(file: DetectorFile, parsed: ParsedJsonConfig, configResourceId: string): CapabilityResource[] {
  const consumed = extractMcpServersFromConfig({
    client,
    scope: scopeForPath(file.path),
    configPath: file.path,
    document: parsed
  }).map((server) => ({
    ...server,
    description: `MCP server consumed by OpenClaw from ${file.path}.`,
    metadata: {
      ...server.metadata,
      mcpRole: 'consumed'
    },
    relationships: [{
      kind: 'defined-by' as const,
      targetResourceId: configResourceId,
      note: 'Consumed MCP server definition comes from this OpenClaw config.',
      evidence: server.evidence[0]
    }]
  }));

  const exposed = firstObjectAtPath(parsed, [
    ['exposedMcpServer'],
    ['exposes', 'mcpServer'],
    ['mcp', 'exposedServer']
  ]);
  const exposedResources = exposed
    ? [mcpRoleResource({ file, parsed, configResourceId, role: 'exposed', object: exposed.value, evidence: exposed.evidence })]
    : [];

  const ambiguous = !consumed.length && !exposed && firstObjectAtPath(parsed, [['mcp']]);
  const ambiguousResources = ambiguous
    ? [mcpRoleResource({ file, parsed, configResourceId, role: 'unknown', object: ambiguous.value, evidence: ambiguous.evidence })]
    : [];

  return [...consumed, ...exposedResources, ...ambiguousResources].map((server) => ({
    ...server,
    relationships: server.relationships.length
      ? server.relationships
      : [{
        kind: 'defined-by' as const,
        targetResourceId: configResourceId,
        note: 'MCP role evidence comes from this OpenClaw config.',
        evidence: server.evidence[0]
      }]
  }));
}

function stateResource(path: string): CapabilityResource {
  const root = openClawRoot(path);
  const sourceEvidence = evidence({
    path,
    sourceLabel: root,
    scannerRule: 'openclaw-state-root',
    matchedPathPattern: '~/.openclaw'
  });

  return resource({
    id: `${client}:state:${stableId(root)}`,
    name: 'OpenClaw state',
    description: 'OpenClaw local state directory is present.',
    client,
    resourceType: 'client-installation',
    scope: 'global',
    path: root,
    evidence: [sourceEvidence],
    tags: ['state'],
    metadata: {
      stateRoot: root
    }
  });
}

function profileResource(file: DetectorFile, profileName: string): CapabilityResource {
  const sourceEvidence = evidence({
    path: file.path,
    scannerRule: 'openclaw-profile',
    matchedPathPattern: '~/.openclaw/profiles/*'
  });

  return resource({
    id: `${client}:profile:${stableId(profileName)}`,
    name: profileName,
    description: `OpenClaw ${profileName} profile.`,
    client,
    resourceType: 'profile',
    scope: 'profile',
    path: `${openClawRoot(file.path)}/profiles/${profileName}`,
    evidence: [sourceEvidence],
    tags: ['profile'],
    metadata: {
      profileName
    }
  });
}

function workspaceResource(file: DetectorFile, workspaceName: string): CapabilityResource {
  const sourceEvidence = evidence({
    path: file.path,
    scannerRule: 'openclaw-workspace',
    matchedPathPattern: '~/.openclaw/workspaces/*'
  });

  return resource({
    id: `${client}:workspace:${stableId(workspaceName)}`,
    name: workspaceName,
    description: `OpenClaw ${workspaceName} workspace state.`,
    client,
    resourceType: 'workspace',
    scope: 'local-private',
    path: `${openClawRoot(file.path)}/workspaces/${workspaceName}`,
    evidence: [sourceEvidence],
    tags: ['workspace'],
    metadata: {
      workspaceName
    }
  });
}

function includeValues(value: JsonValue | undefined): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

function includePathsForConfig(file: DetectorFile): string[] {
  if (file.content === undefined || !basename(file.path).endsWith('.json')) return [];
  const parsed = parseJsonConfig({
    client,
    path: file.path,
    content: file.content,
    scannerRule: 'openclaw-config-includes',
    matchedPathPattern: basename(file.path)
  });
  return [
    ...includeValues(getJsonValueAtPath(parsed, ['include'])?.value),
    ...includeValues(getJsonValueAtPath(parsed, ['includes'])?.value),
    ...includeValues(getJsonValueAtPath(parsed, ['import'])?.value),
    ...includeValues(getJsonValueAtPath(parsed, ['imports'])?.value)
  ].map((includePath) => resolveRelative(file.path, includePath));
}

function isConfig(file: DetectorFile): boolean {
  const base = basename(file.path).toLowerCase();
  return base === 'openclaw.json' || base === 'config.json';
}

function isSensitiveStore(file: DetectorFile): boolean {
  const normalized = comparablePath(file.path);
  const base = basename(file.path).toLowerCase();
  return isOpenClawFile(file)
    && (base === '.env'
      || base.startsWith('.env.')
      || base.includes('credential')
      || base.includes('auth')
      || base.includes('secret')
      || base.includes('token')
      || base.endsWith('.pem')
      || base.endsWith('.key')
      || normalized.includes('/credentials/')
      || normalized.includes('/secrets/')
      || normalized.includes('/tokens/'));
}

function isLogSessionMemoryStore(file: DetectorFile): boolean {
  const normalized = comparablePath(file.path);
  const base = basename(file.path).toLowerCase();
  return isOpenClawFile(file)
    && (normalized.includes('/logs/')
      || normalized.includes('/sessions/')
      || normalized.includes('/transcripts/')
      || normalized.includes('/cache/traces/')
      || normalized.includes('/traces/')
      || normalized.includes('/memory/')
      || base.endsWith('.log')
      || base.includes('session')
      || base.includes('transcript')
      || base.includes('trace')
      || base === 'memory.json'
      || base === 'memory.md');
}

function safeStoreResource(file: DetectorFile, resourceType: 'sensitive-store' | 'log-session-store'): CapabilityResource {
  const sourceEvidence = evidence({
    path: file.path,
    scannerRule: resourceType === 'sensitive-store' ? 'openclaw-sensitive-store' : 'openclaw-log-session-memory-store',
    matchedPathPattern: resourceType === 'sensitive-store' ? 'OpenClaw credentials/tokens' : 'OpenClaw logs/sessions/memory/traces',
    readStatus: 'skipped',
    parseStatus: 'skipped'
  });

  return resource({
    id: `${client}:${resourceType}:${stableId(file.path)}`,
    name: basename(file.path),
    description: resourceType === 'sensitive-store'
      ? 'OpenClaw credential/token store presence. Content is not read for inventory.'
      : 'OpenClaw log/session/memory store presence. Content is not read for inventory.',
    client,
    resourceType,
    scope: scopeForPath(file.path),
    status: 'sensitive',
    statuses: ['found', 'sensitive'],
    path: file.path,
    evidence: [sourceEvidence],
    warnings: [warning('secret-auth-concern', 'info', 'OpenClaw store content is represented as metadata only.', sourceEvidence)],
    tags: resourceType === 'sensitive-store' ? ['sensitive'] : ['logs', 'sessions', 'memory'],
    metadata: {
      profileName: namedSegment(file.path, 'profiles') ?? '',
      workspaceName: namedSegment(file.path, 'workspaces') ?? '',
      sizeBytes: file.sizeBytes ?? 0,
      contentRead: false
    },
    contentPreview: {
      policy: resourceType === 'sensitive-store' ? 'unread-sensitive' : 'metadata-only',
      rawPreviewAllowed: false,
      reason: 'OpenClaw sensitive/log/session/memory content is not read by default.'
    }
  });
}

export function detectOpenClaw(files: DetectorFile[]): DetectorResult {
  const result = emptyDetectorResult();
  const openClawFiles = files.filter(isOpenClawFile);
  const fileByPath = new Map(openClawFiles.map((file) => [normalizePath(file.path), file]));
  const seenStateRoots = new Set<string>();
  const seenProfiles = new Set<string>();
  const seenWorkspaces = new Set<string>();

  for (const file of openClawFiles) {
    const root = openClawRoot(file.path);
    if (!seenStateRoots.has(root)) {
      seenStateRoots.add(root);
      result.resources.push(stateResource(file.path));
    }

    const profileName = namedSegment(file.path, 'profiles');
    if (profileName && !seenProfiles.has(profileName)) {
      seenProfiles.add(profileName);
      result.resources.push(profileResource(file, profileName));
    }

    const workspaceName = namedSegment(file.path, 'workspaces');
    if (workspaceName && !seenWorkspaces.has(workspaceName)) {
      seenWorkspaces.add(workspaceName);
      result.resources.push(workspaceResource(file, workspaceName));
    }

    if (isSensitiveStore(file) || isLogSessionMemoryStore(file)) {
      const resourceType = isSensitiveStore(file) ? 'sensitive-store' : 'log-session-store';
      const store = safeStoreResource(file, resourceType);
      result.resources.push(store);
      result.skippedSensitiveStores.push({
        id: `skipped:${store.id}`,
        client,
        resourceType,
        scope: store.scope,
        path: file.path,
        reason: 'OpenClaw sensitive/log/session/memory content is represented as metadata only.',
        evidence: store.evidence[0]
      });
      continue;
    }

    if (isConfig(file) && file.content !== undefined) {
      const parsed = parseJsonConfig({
        client,
        path: file.path,
        content: file.content,
        scannerRule: 'openclaw-config',
        matchedPathPattern: basename(file.path)
      });
      result.parseErrors.push(...parseErrorsFromConfig(parsed.parseErrors));
      const config = configResource(file, parsed);
      result.resources.push(config);
      result.resources.push(...mcpResourcesForConfig(file, parsed, config.id));

      for (const includePath of includePathsForConfig(file)) {
        const included = fileByPath.get(includePath);
        if (included) {
          result.resources.push(genericResource(included, {
            ...evidence({
              path: included.path,
              scannerRule: 'openclaw-included-config',
              matchedPathPattern: includePath
            }),
            includedFromPath: file.path
          }));
        } else {
          result.warnings.push({
            id: `openclaw-missing-include:${stableId(file.path)}:${stableId(includePath)}`,
            client,
            severity: 'warning',
            message: `OpenClaw included config is missing or unreadable: ${includePath}`,
            evidence: {
              ...evidence({
                path: includePath,
                scannerRule: 'openclaw-missing-include',
                matchedPathPattern: includePath,
                readStatus: 'not-found',
                parseStatus: 'skipped'
              }),
              includedFromPath: file.path
            }
          });
        }
      }
      continue;
    }

    if (!isConfig(file)) {
      const resourceType = resourceTypeForPath(file.path);
      if (resourceType !== 'config-file') result.resources.push(genericResource(file));
    }
  }

  return result;
}
