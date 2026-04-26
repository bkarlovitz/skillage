import { describe, expect, it } from 'vitest';
import { findSkillById } from './detail';
import type { SkillItem } from './types';

function skill(id: string, name = id): SkillItem {
  return {
    id,
    name,
    description: `${name} description`,
    target: 'claude-code',
    kind: 'skill',
    scope: 'global',
    path: `/tmp/${name}/SKILL.md`,
    entryFile: 'SKILL.md',
    body: `# ${name}`,
    tags: [],
    metadata: {},
    issues: []
  };
}

describe('findSkillById', () => {
  it('returns the matching skill when the id exists', () => {
    const target = skill('target', 'Target Skill');

    expect(findSkillById([skill('first'), target, skill('last')], 'target')).toBe(target);
  });

  it('returns undefined when the id is empty or missing', () => {
    const rows = [skill('first')];

    expect(findSkillById(rows, '')).toBeUndefined();
    expect(findSkillById(rows, 'missing')).toBeUndefined();
  });
});
