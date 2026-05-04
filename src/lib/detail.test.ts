import { describe, expect, it } from 'vitest';
import { findCapabilityResourceById } from './detail';
import type { CapabilityResource } from './inventory/types';

function resource(id: string, name = id): CapabilityResource {
  return {
    id,
    name,
    description: `${name} description`,
    client: 'claude-code',
    resourceType: 'skill',
    scope: 'global',
    status: 'found',
    path: `/tmp/${name}/SKILL.md`,
    previewPolicy: 'safe-markdown-preview',
    evidence: [{
      sourcePath: `/tmp/${name}/SKILL.md`,
      scannerRule: 'test',
      matchedPathPattern: 'SKILL.md',
      readStatus: 'read',
      parseStatus: 'parsed'
    }],
    tags: [],
    metadata: {},
    warnings: [],
    relationships: []
  };
}

describe('findCapabilityResourceById', () => {
  it('returns the matching resource when the id exists', () => {
    const target = resource('target', 'Target Resource');

    expect(findCapabilityResourceById([resource('first'), target, resource('last')], 'target')).toBe(target);
  });

  it('returns undefined when the id is empty or missing', () => {
    const rows = [resource('first')];

    expect(findCapabilityResourceById(rows, '')).toBeUndefined();
    expect(findCapabilityResourceById(rows, 'missing')).toBeUndefined();
  });
});
