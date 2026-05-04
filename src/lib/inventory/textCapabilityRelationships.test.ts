import { describe, expect, it } from 'vitest';
import { analyzeTextCapabilityRelationships } from './textCapabilityRelationships';
import type { CapabilityClient, CapabilityResource, CapabilityResourceType } from './types';

function textResource(input: {
  id: string;
  name: string;
  client: CapabilityClient;
  resourceType?: CapabilityResourceType;
  path: string;
  description?: string;
}): CapabilityResource {
  return {
    id: input.id,
    name: input.name,
    description: input.description ?? `${input.name} resource`,
    client: input.client,
    resourceType: input.resourceType ?? 'skill',
    scope: 'global',
    status: 'found',
    path: input.path,
    evidence: [{
      sourcePath: input.path,
      scannerRule: `${input.client}-text`,
      matchedPathPattern: input.path.endsWith('.md') ? '*.md' : 'SKILL.md',
      readStatus: 'read',
      parseStatus: 'parsed'
    }],
    warnings: [],
    relationships: [],
    tags: [],
    metadata: {}
  };
}

describe('skill and instruction relationship analysis', () => {
  it('labels same-path skills as identical', () => {
    const groups = analyzeTextCapabilityRelationships([
      textResource({ id: 'claude-reviewer', name: 'reviewer', client: 'claude-code', path: '/repo/.shared/reviewer/SKILL.md' }),
      textResource({ id: 'codex-reviewer', name: 'reviewer', client: 'codex', path: '/repo/.shared/reviewer/SKILL.md' })
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].relationshipLabel).toBe('identical');
    expect(groups[0].notes).toEqual(expect.arrayContaining([
      expect.stringContaining('Shared source')
    ]));
  });

  it('labels similarly described skills as similar without claiming identical behavior', () => {
    const groups = analyzeTextCapabilityRelationships([
      textResource({
        id: 'claude-reviewer',
        name: 'reviewer',
        client: 'claude-code',
        path: '/home/user/.claude/skills/reviewer/SKILL.md',
        description: 'Review project conventions and test coverage.'
      }),
      textResource({
        id: 'codex-code-review',
        name: 'code review',
        client: 'codex',
        path: '/home/user/.agents/skills/code-review/SKILL.md',
        description: 'Review project conventions before changing code.'
      })
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].relationshipLabel).toBe('similar');
    expect(groups[0].notes[0]).toContain('not guaranteed behavior');
    expect(groups[0].instances.map((instance) => instance.client).sort()).toEqual(['claude-code', 'codex']);
  });

  it('keeps unrelated same-name instructions as same-name-only', () => {
    const groups = analyzeTextCapabilityRelationships([
      textResource({
        id: 'claude-agents',
        name: 'AGENTS.md',
        client: 'claude-code',
        resourceType: 'instruction-file',
        path: '/repo/AGENTS.md',
        description: 'Frontend instructions.'
      }),
      textResource({
        id: 'codex-agents',
        name: 'AGENTS.md',
        client: 'codex',
        resourceType: 'instruction-file',
        path: '/other/AGENTS.md',
        description: 'Deployment notes.'
      })
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].relationshipLabel).toBe('same-name-only');
    expect(groups[0].notes).toEqual(expect.arrayContaining([
      'Shared name alone is not enough to infer identical behavior.',
      'Source evidence diverges across clients or locations.'
    ]));
  });
});
