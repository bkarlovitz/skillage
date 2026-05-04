import { parseJsonConfig, type JsonObject, type JsonValue, type ParsedJsonConfig } from '../config/json';
import { parseTomlConfig } from '../config/toml';
import { extractMcpServersFromConfig, type ParsedConfigDocument } from '../mcp';
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

const client = 'hermes' as const;

function segments(path: string): string[] {
  return normalizePath(path).split('/').filter(Boolean);
}

function hermesIndex(path: string): number {
  return segments(path).findIndex((part) => part.toLowerCase() === '.hermes');
}

function isHermesFile(file: DetectorFile): boolean {
  return comparablePath(file.path).includes('/.hermes/');
}

function profileNameForPath(path: string): string | undefined {
  const parts = segments(path);
  const index = hermesIndex(path);
  if (index < 0) return undefined;

  if (parts[index + 1]?.toLowerCase() === 'profiles' && parts[index + 2]) {
    return parts[index + 2];
  }

  if (parts[index + 1]?.toLowerCase() === 'config.yaml' || parts[index + 1]?.toLowerCase() === 'config.yml') {
    return 'default';
  }

  return undefined;
}

function profileNameOrDefault(path: string): string {
  return profileNameForPath(path) ?? 'default';
}

function profileRootForPath(path: string, profileName: string): string {
  const parts = segments(path);
  const index = hermesIndex(path);
  const prefix = parts.slice(0, index + 1).join('/');
  return `${path.startsWith('/') ? '/' : ''}${prefix}/profiles/${profileName}`;
}

function skillNameFromPath(path: string): string {
  const parts = segments(path);
  return parts[parts.length - 2] ?? basename(path);
}

function scopeForPath(path: string): CapabilityScope {
  const normalized = comparablePath(path);
  if (normalized.includes('/.hermes/hermes-agent/') || normalized.includes('/.hermes/skills/.hub/')) return 'plugin-bundled';
  if (normalized.includes('/.hermes/profiles/')) return 'profile';
  return 'global';
}

function resourceTypeForPath(path: string): CapabilityResourceType {
  const base = basename(path).toLowerCase();
  if (base === 'skill.md') return 'skill';
  return 'config-file';
}

function legacyScopeForPath(path: string): string | undefined {
  const normalized = comparablePath(path);
  if (normalized.includes('/.hermes/skills/.hub/quarantine/')) return 'temporary';
  if (normalized.includes('/.hermes/skills/.hub/')) return 'cache';
  return undefined;
}

function bundleKindForPath(path: string): string | undefined {
  const normalized = comparablePath(path);
  if (normalized.includes('/.hermes/hermes-agent/optional-skills/')) return 'optional-bundled';
  if (normalized.includes('/.hermes/hermes-agent/skills/')) return 'bundled';
  return undefined;
}

function isHermesConfig(file: DetectorFile): boolean {
  const base = basename(file.path).toLowerCase();
  return isHermesFile(file) && ['config.yaml', 'config.yml', 'config.json', 'config.toml', 'mcp.json'].includes(base);
}

function isHermesSkill(file: DetectorFile): boolean {
  return isHermesFile(file) && basename(file.path) === 'SKILL.md';
}

function genericHermesResource(file: DetectorFile): CapabilityResource {
  const resourceType = resourceTypeForPath(file.path);
  const scope = scopeForPath(file.path);
  const legacyScope = legacyScopeForPath(file.path);
  const sourceEvidence = evidence({
    path: file.path,
    scannerRule: resourceType === 'skill' ? 'hermes-skill' : 'hermes-config',
    matchedPathPattern: basename(file.path)
  });
  const status: CapabilityStatus = legacyScope === 'temporary' ? 'needs-review' : 'found';

  return resource({
    id: `${client}:${resourceType}:${stableId(file.path)}`,
    name: resourceType === 'skill' ? skillNameFromPath(file.path) : basename(file.path),
    description: `Hermes ${resourceType} discovered from ${file.path}.`,
    client,
    resourceType,
    scope,
    status,
    statuses: status === 'needs-review' ? ['found', 'needs-review'] : ['found'],
    path: file.path,
    evidence: [sourceEvidence],
    warnings: legacyScope === 'temporary'
      ? [warning('runtime-caveat', 'warning', 'Hermes quarantine artifact is temporary/internal and hidden by default.', sourceEvidence)]
      : [],
    tags: resourceType === 'skill' ? ['skill'] : ['config'],
    metadata: {
      profileName: scope === 'profile' ? profileNameOrDefault(file.path) : '',
      bundleKind: bundleKindForPath(file.path) ?? '',
      legacyScope: legacyScope ?? '',
      internalArtifact: legacyScope === 'cache' || legacyScope === 'temporary'
    }
  });
}

function parseYamlScalar(raw: string): JsonValue {
  const value = raw.trim().replace(/^['"]|['"]$/g, '');
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).split(',').map((part) => part.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function yamlIndent(line: string): number {
  return line.match(/^ */)?.[0].length ?? 0;
}

function parseHermesYamlMcp(content: string): JsonObject {
  const root: JsonObject = {};
  const lines = content.split(/\r?\n/);
  let inMcp = false;
  let mcpIndent = 0;
  let currentServer = '';
  let currentServerIndent = 0;

  for (const rawLine of lines) {
    const withoutComment = rawLine.replace(/\s+#.*$/, '');
    const line = withoutComment.trim();
    if (!line) continue;
    const indent = yamlIndent(rawLine);

    if (/^(mcpServers|mcp_servers):\s*$/.test(line)) {
      inMcp = true;
      mcpIndent = indent;
      root.mcpServers = {};
      continue;
    }

    if (!inMcp) continue;
    if (indent <= mcpIndent) {
      inMcp = false;
      currentServer = '';
      continue;
    }

    const serverMatch = line.match(/^([A-Za-z0-9_.-]+):\s*$/);
    if (serverMatch && indent > mcpIndent) {
      currentServer = serverMatch[1];
      currentServerIndent = indent;
      (root.mcpServers as JsonObject)[currentServer] = {};
      continue;
    }

    const fieldMatch = line.match(/^([A-Za-z0-9_.-]+):\s*(.+)$/);
    if (fieldMatch && currentServer && indent > currentServerIndent) {
      const server = (root.mcpServers as JsonObject)[currentServer] as JsonObject;
      server[fieldMatch[1]] = parseYamlScalar(fieldMatch[2]);
    }
  }

  return root;
}

function yamlMcpDocument(file: DetectorFile): ParsedJsonConfig {
  const value = parseHermesYamlMcp(file.content ?? '');
  return {
    format: 'json',
    path: file.path,
    client,
    value,
    evidence: evidence({
      path: file.path,
      scannerRule: 'hermes-yaml-config',
      matchedPathPattern: basename(file.path),
      parseStatus: 'partially-parsed'
    }),
    parseErrors: [],
    warnings: [],
    contentPreview: {
      policy: 'metadata-only',
      rawPreviewAllowed: false,
      reason: 'Hermes YAML config is parsed only for simple MCP inventory metadata.'
    }
  };
}

function parsedConfig(file: DetectorFile): ParsedConfigDocument | undefined {
  if (file.content === undefined) return undefined;
  const base = basename(file.path).toLowerCase();

  if (base.endsWith('.json')) {
    return parseJsonConfig({
      client,
      path: file.path,
      content: file.content,
      scannerRule: 'hermes-config',
      matchedPathPattern: base
    });
  }

  if (base.endsWith('.toml')) {
    return parseTomlConfig({
      client,
      path: file.path,
      content: file.content,
      scannerRule: 'hermes-config',
      matchedPathPattern: base
    });
  }

  return yamlMcpDocument(file);
}

export function detectHermes(files: DetectorFile[]): DetectorResult {
  const result = emptyDetectorResult();
  const profiles = new Map<string, { name: string; path: string; sourcePath: string }>();

  for (const file of files.filter(isHermesFile)) {
    const profileName = profileNameForPath(file.path);
    if (!profileName) continue;
    const profilePath = profileRootForPath(file.path, profileName);
    profiles.set(profileName, { name: profileName, path: profilePath, sourcePath: file.path });
  }

  for (const profile of Array.from(profiles.values()).sort((a, b) => a.name.localeCompare(b.name))) {
    const profileEvidence = evidence({
      path: profile.sourcePath,
      sourceLabel: profile.path,
      scannerRule: 'hermes-profile',
      matchedPathPattern: '~/.hermes/profiles/*'
    });

    result.resources.push(resource({
      id: `${client}:profile:${stableId(profile.name)}`,
      name: profile.name,
      description: `Hermes ${profile.name} profile environment.`,
      client,
      resourceType: 'profile',
      scope: 'profile',
      status: 'found',
      path: profile.path,
      evidence: [profileEvidence],
      tags: ['profile'],
      metadata: {
        profileName: profile.name,
        mergedAcrossProfiles: false
      }
    }));
  }

  for (const file of files.filter(isHermesFile)) {
    if (isHermesConfig(file)) {
      const parsed = parsedConfig(file);
      result.resources.push(genericHermesResource(file));
      if (parsed) {
        result.parseErrors.push(...parseErrorsFromConfig(parsed.parseErrors));
        result.resources.push(...extractMcpServersFromConfig({
          client,
          scope: scopeForPath(file.path),
          configPath: file.path,
          document: parsed
        }).map((server) => ({
          ...server,
          metadata: {
            ...server.metadata,
            profileName: profileNameOrDefault(file.path)
          }
        })));
      }
      continue;
    }

    if (isHermesSkill(file)) {
      result.resources.push(genericHermesResource(file));
    }
  }

  return result;
}
