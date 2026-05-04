import type { KnownClientLocation } from './scan';
import type { CapabilityClient, CapabilityResourceType, CapabilityScope } from './types';

export type OsFamily = 'linux' | 'macos' | 'windows' | 'wsl';

export interface KnownLocationContext {
  home: string;
  windowsHome?: string;
  appData?: string;
  distro?: string;
  wslUser?: string;
}

export interface KnownLocationDefinition {
  id: string;
  client: CapabilityClient;
  label: string;
  scope: CapabilityScope;
  resourceType: CapabilityResourceType;
  roots: Record<OsFamily, string[]>;
}

const wslRoots = [
  String.raw`\\wsl.localhost\{distro}\home\{wslUser}`,
  String.raw`\\wsl$\{distro}\home\{wslUser}`
];

function wslLocationTemplates(...suffixes: string[]): string[] {
  return wslRoots.flatMap((root) => suffixes.map((suffix) => `${root}${suffix}`));
}

export const knownLocationDefinitions: KnownLocationDefinition[] = [
  {
    id: 'claude-code-home',
    client: 'claude-code',
    label: 'Claude Code home',
    scope: 'global',
    resourceType: 'config-file',
    roots: {
      linux: ['{home}/.claude'],
      macos: ['{home}/.claude'],
      windows: [String.raw`{windowsHome}\.claude`],
      wsl: wslLocationTemplates(String.raw`\.claude`)
    }
  },
  {
    id: 'claude-desktop-config',
    client: 'claude-desktop',
    label: 'Claude Desktop MCP config',
    scope: 'global',
    resourceType: 'config-file',
    roots: {
      linux: ['{home}/.config/Claude/claude_desktop_config.json'],
      macos: ['{home}/Library/Application Support/Claude/claude_desktop_config.json'],
      windows: [String.raw`{appData}\Claude\claude_desktop_config.json`],
      wsl: wslLocationTemplates('/.config/Claude/claude_desktop_config.json')
    }
  },
  {
    id: 'codex-home',
    client: 'codex',
    label: 'Codex home',
    scope: 'global',
    resourceType: 'config-file',
    roots: {
      linux: ['{home}/.codex', '{home}/.agents', '/etc/codex'],
      macos: ['{home}/.codex', '{home}/.agents'],
      windows: [String.raw`{windowsHome}\.codex`, String.raw`{windowsHome}\.agents`],
      wsl: wslLocationTemplates(String.raw`\.codex`, String.raw`\.agents`)
    }
  },
  {
    id: 'cursor-user',
    client: 'cursor',
    label: 'Cursor user config',
    scope: 'global',
    resourceType: 'config-file',
    roots: {
      linux: ['{home}/.cursor', '{home}/.config/Cursor/User'],
      macos: ['{home}/.cursor', '{home}/Library/Application Support/Cursor/User'],
      windows: [String.raw`{windowsHome}\.cursor`, String.raw`{appData}\Cursor\User`],
      wsl: wslLocationTemplates(String.raw`\.cursor`, '/.config/Cursor/User')
    }
  },
  {
    id: 'hermes-profiles',
    client: 'hermes',
    label: 'Hermes profiles',
    scope: 'profile',
    resourceType: 'profile',
    roots: {
      linux: ['{home}/.hermes', '{home}/.hermes/profiles'],
      macos: ['{home}/.hermes', '{home}/.hermes/profiles'],
      windows: [String.raw`{windowsHome}\.hermes`, String.raw`{windowsHome}\.hermes\profiles`],
      wsl: wslLocationTemplates(String.raw`\.hermes`, String.raw`\.hermes\profiles`)
    }
  },
  {
    id: 'openclaw-state',
    client: 'openclaw',
    label: 'OpenClaw state',
    scope: 'global',
    resourceType: 'config-file',
    roots: {
      linux: ['{home}/.openclaw'],
      macos: ['{home}/.openclaw'],
      windows: [String.raw`{windowsHome}\.openclaw`],
      wsl: wslLocationTemplates(String.raw`\.openclaw`)
    }
  }
];

function fillTemplate(template: string, context: KnownLocationContext): string {
  return template
    .replaceAll('{home}', context.home)
    .replaceAll('{windowsHome}', context.windowsHome ?? context.home)
    .replaceAll('{appData}', context.appData ?? String.raw`${context.windowsHome ?? context.home}\AppData\Roaming`)
    .replaceAll('{distro}', context.distro ?? 'Ubuntu')
    .replaceAll('{wslUser}', context.wslUser ?? 'user');
}

function normalizeComparablePath(path: string): string {
  const slashPath = path.replace(/\\/g, '/');
  const unc = slashPath.startsWith('//');
  const collapsed = slashPath.replace(/\/+/g, '/');
  const normalized = `${unc ? '/' : ''}${collapsed}`.toLowerCase();
  return normalized.replace(/^\/\/wsl(?:\.localhost|\$)\//, 'wsl:/');
}

export function knownClientLocationsForPlatform(osFamily: OsFamily, context: KnownLocationContext, existingPaths: Iterable<string> = []): KnownClientLocation[] {
  const existing = new Set(Array.from(existingPaths, normalizeComparablePath));
  const seen = new Set<string>();

  return knownLocationDefinitions.flatMap((definition) => definition.roots[osFamily].flatMap((template) => {
    const path = fillTemplate(template, context);
    const comparablePath = normalizeComparablePath(path);
    if (seen.has(`${definition.id}:${comparablePath}`)) return [];
    seen.add(`${definition.id}:${comparablePath}`);
    const exists = existing.has(comparablePath);

    return [{
      client: definition.client,
      label: definition.label,
      path,
      exists,
      scope: definition.scope,
      resourceType: definition.resourceType,
      evidence: {
        sourcePath: path,
        scannerRule: `known-location:${definition.id}`,
        matchedPathPattern: template,
        readStatus: exists ? 'read' : 'not-found',
        parseStatus: 'not-applicable'
      }
    } satisfies KnownClientLocation];
  }));
}
