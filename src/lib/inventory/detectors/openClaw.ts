import { getJsonValueAtPath, parseJsonConfig, type JsonValue } from '../config/json';
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

    if (isConfig(file) && file.content !== undefined) {
      const parsed = parseJsonConfig({
        client,
        path: file.path,
        content: file.content,
        scannerRule: 'openclaw-config',
        matchedPathPattern: basename(file.path)
      });
      result.parseErrors.push(...parseErrorsFromConfig(parsed.parseErrors));
      result.resources.push({
        ...genericResource(file),
        status: parsed.parseErrors.length ? 'parse-error' : 'found',
        contentPreview: parsed.contentPreview,
        warnings: parsed.warnings
      });

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
