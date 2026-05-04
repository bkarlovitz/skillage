import { describe, expect, it } from 'vitest';
import { detectHermes } from './hermes';

describe('Hermes detector', () => {
  it('detects default profile from explicit profile directory', () => {
    const result = detectHermes([{
      path: '/home/user/.hermes/profiles/default/config.yaml',
      content: 'name: default'
    }]);

    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].resourceType).toBe('profile');
    expect(result.resources[0].scope).toBe('profile');
    expect(result.resources[0].metadata.profileName).toBe('default');
  });

  it('detects default profile from root config file', () => {
    const result = detectHermes([{
      path: '/home/user/.hermes/config.yaml',
      content: 'activeProfile: default'
    }]);

    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].name).toBe('default');
    expect(result.resources[0].path).toBe('/home/user/.hermes/profiles/default');
  });

  it('detects named profiles as distinct profile environments', () => {
    const result = detectHermes([{
      path: '/home/user/.hermes/profiles/work/config.yaml',
      content: 'name: work'
    }, {
      path: '/home/user/.hermes/profiles/research/config.yaml',
      content: 'name: research'
    }]);

    expect(result.resources.map((resource) => resource.name)).toEqual(['research', 'work']);
    expect(new Set(result.resources.map((resource) => resource.id)).size).toBe(2);
  });

  it('does not merge resources across profile names', () => {
    const result = detectHermes([{
      path: '/home/user/.hermes/profiles/work/skills/reviewer/SKILL.md',
      content: '# Reviewer'
    }, {
      path: '/home/user/.hermes/profiles/research/skills/reviewer/SKILL.md',
      content: '# Reviewer'
    }]);

    expect(result.resources).toHaveLength(2);
    expect(result.resources.every((resource) => resource.metadata.mergedAcrossProfiles === false)).toBe(true);
    expect(new Set(result.resources.map((resource) => resource.metadata.profileName))).toEqual(new Set(['research', 'work']));
  });
});
