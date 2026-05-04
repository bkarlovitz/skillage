import { describe, expect, it } from 'vitest';
import { detectHermes } from './hermes';

describe('Hermes detector', () => {
  it('detects default profile from explicit profile directory', () => {
    const result = detectHermes([{
      path: '/home/user/.hermes/profiles/default/config.yaml',
      content: 'name: default'
    }]);
    const profiles = result.resources.filter((resource) => resource.resourceType === 'profile');

    expect(profiles).toHaveLength(1);
    expect(profiles[0].resourceType).toBe('profile');
    expect(profiles[0].scope).toBe('profile');
    expect(profiles[0].metadata.profileName).toBe('default');
  });

  it('detects default profile from root config file', () => {
    const result = detectHermes([{
      path: '/home/user/.hermes/config.yaml',
      content: 'activeProfile: default'
    }]);
    const profiles = result.resources.filter((resource) => resource.resourceType === 'profile');

    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('default');
    expect(profiles[0].path).toBe('/home/user/.hermes/profiles/default');
  });

  it('detects named profiles as distinct profile environments', () => {
    const result = detectHermes([{
      path: '/home/user/.hermes/profiles/work/config.yaml',
      content: 'name: work'
    }, {
      path: '/home/user/.hermes/profiles/research/config.yaml',
      content: 'name: research'
    }]);
    const profiles = result.resources.filter((resource) => resource.resourceType === 'profile');

    expect(profiles.map((resource) => resource.name)).toEqual(['research', 'work']);
    expect(new Set(profiles.map((resource) => resource.id)).size).toBe(2);
  });

  it('does not merge resources across profile names', () => {
    const result = detectHermes([{
      path: '/home/user/.hermes/profiles/work/skills/reviewer/SKILL.md',
      content: '# Reviewer'
    }, {
      path: '/home/user/.hermes/profiles/research/skills/reviewer/SKILL.md',
      content: '# Reviewer'
    }]);
    const profiles = result.resources.filter((resource) => resource.resourceType === 'profile');

    expect(profiles).toHaveLength(2);
    expect(profiles.every((resource) => resource.metadata.mergedAcrossProfiles === false)).toBe(true);
    expect(new Set(profiles.map((resource) => resource.metadata.profileName))).toEqual(new Set(['research', 'work']));
  });

  it('detects active user skills', () => {
    const result = detectHermes([{
      path: '/home/user/.hermes/skills/reviewer/SKILL.md',
      content: '# Reviewer'
    }]);

    const skill = result.resources.find((resource) => resource.resourceType === 'skill');
    expect(skill?.name).toBe('reviewer');
    expect(skill?.scope).toBe('global');
    expect(skill?.metadata.internalArtifact).toBe(false);
  });

  it('detects bundled and optional bundled skills distinctly', () => {
    const result = detectHermes([{
      path: '/home/user/.hermes/hermes-agent/skills/core/SKILL.md',
      content: '# Core'
    }, {
      path: '/home/user/.hermes/hermes-agent/optional-skills/extra/SKILL.md',
      content: '# Extra'
    }]);

    const bundleKinds = result.resources.filter((resource) => resource.resourceType === 'skill').map((resource) => resource.metadata.bundleKind);
    expect(bundleKinds).toEqual(['bundled', 'optional-bundled']);
    expect(result.resources.every((resource) => resource.scope === 'plugin-bundled')).toBe(true);
  });

  it('marks cache and quarantine artifacts as internal or temporary', () => {
    const result = detectHermes([{
      path: '/home/user/.hermes/skills/.hub/cache/pkg/SKILL.md',
      content: '# Cached'
    }, {
      path: '/home/user/.hermes/skills/.hub/quarantine/bad/SKILL.md',
      content: '# Quarantined'
    }]);

    const cache = result.resources.find((resource) => resource.path?.includes('/cache/'));
    const quarantine = result.resources.find((resource) => resource.path?.includes('/quarantine/'));

    expect(cache?.metadata.legacyScope).toBe('cache');
    expect(cache?.metadata.internalArtifact).toBe(true);
    expect(quarantine?.metadata.legacyScope).toBe('temporary');
    expect(quarantine?.status).toBe('needs-review');
  });

  it('extracts Hermes MCP servers from simple YAML config', () => {
    const result = detectHermes([{
      path: '/home/user/.hermes/profiles/default/config.yaml',
      content: `
mcpServers:
  github:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
`
    }]);

    const server = result.resources.find((resource) => resource.resourceType === 'mcp-server');

    expect(server?.name).toBe('github');
    expect(server?.scope).toBe('profile');
    expect(server?.status).toBe('not-tested');
    expect(server?.metadata.package).toBe('@modelcontextprotocol/server-github');
    expect(server?.metadata.profileName).toBe('default');
  });
});
