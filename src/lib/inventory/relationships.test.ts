import { describe, expect, it } from 'vitest';
import { inferCapabilityRelationship, relationshipLabels, strongestRelationshipLabel, type RelationshipLabel } from './relationships';
import type { CapabilityResource } from './types';

function resource(id: string, overrides: Partial<CapabilityResource> = {}): CapabilityResource {
  return {
    id,
    name: overrides.name ?? id,
    description: overrides.description ?? `${id} test resource`,
    client: overrides.client ?? 'cursor',
    resourceType: overrides.resourceType ?? 'mcp-server',
    scope: overrides.scope ?? 'global',
    status: overrides.status ?? 'found',
    statuses: overrides.statuses,
    path: overrides.path ?? `/fixtures/${id}.json`,
    evidence: overrides.evidence ?? [{
      sourcePath: overrides.path ?? `/fixtures/${id}.json`,
      scannerRule: 'test-rule',
      matchedPathPattern: '*.json',
      readStatus: 'read',
      parseStatus: 'parsed'
    }],
    warnings: overrides.warnings ?? [],
    relationships: overrides.relationships ?? [],
    tags: overrides.tags ?? [],
    metadata: overrides.metadata ?? {}
  };
}

function relationLabel(left: CapabilityResource, right: CapabilityResource): RelationshipLabel {
  return inferCapabilityRelationship(left, right).label;
}

describe('relationship evidence thresholds', () => {
  it('defines every Sprint 7 relationship label once', () => {
    expect(relationshipLabels).toEqual([
      'identical',
      'similar',
      'same-name-only',
      'shadowed',
      'overridden',
      'conflict',
      'duplicate',
      'needs-review',
      'no-relationship-inferred'
    ]);
  });

  it('uses identical only when shared name has stronger same-source evidence', () => {
    const left = resource('left', { name: 'github', path: '/repo/.cursor/mcp.json' });
    const right = resource('right', { name: 'github', path: '/repo/.cursor/mcp.json' });

    expect(relationLabel(left, right)).toBe('identical');
    expect(inferCapabilityRelationship(left, right).evidence).toContain('same-source-path');
  });

  it('does not promote same-name-only to identical', () => {
    const left = resource('left', { name: 'github', metadata: { command: 'node', args: ['a.js'] } });
    const right = resource('right', { name: 'github', metadata: { command: 'python', args: ['b.py'] }, client: 'codex' });

    expect(relationLabel(left, right)).toBe('same-name-only');
  });

  it('uses duplicate for same name plus matching launch evidence in separate resources', () => {
    const left = resource('left', { name: 'github', path: '/cursor.json', metadata: { command: 'npx', args: ['@mcp/github'] } });
    const right = resource('right', { name: 'github', path: '/codex.toml', client: 'codex', metadata: { command: 'npx', args: ['@mcp/github'] } });

    expect(relationLabel(left, right)).toBe('duplicate');
  });

  it('uses similar for different names with matching launch evidence', () => {
    const left = resource('left', { name: 'github', metadata: { command: 'npx', args: ['@mcp/github'] } });
    const right = resource('right', { name: 'gh', metadata: { command: 'npx', args: ['@mcp/github'] } });

    expect(relationLabel(left, right)).toBe('similar');
  });

  it('uses conflict only with same client/scope/name and incompatible launch evidence', () => {
    const left = resource('left', { name: 'github', client: 'cursor', scope: 'project-shared', metadata: { command: 'node', args: ['server.js'] } });
    const right = resource('right', { name: 'github', client: 'cursor', scope: 'project-shared', metadata: { command: 'python', args: ['server.py'] } });

    expect(relationLabel(left, right)).toBe('conflict');
  });

  it('uses shadowed when explicit precedence evidence says a resource is shadowed', () => {
    const winner = resource('workspace-skill', { name: 'build', resourceType: 'skill', scope: 'local-private' });
    const lower = resource('global-skill', {
      name: 'build',
      resourceType: 'skill',
      status: 'shadowed',
      relationships: [{ kind: 'shadowed-by', targetResourceId: winner.id }]
    });

    expect(relationLabel(winner, lower)).toBe('shadowed');
  });

  it('uses overridden when explicit override evidence exists', () => {
    const base = resource('base-rule', { name: 'format', resourceType: 'rule' });
    const override = resource('override-rule', {
      name: 'format',
      resourceType: 'rule',
      relationships: [{ kind: 'overrides', targetResourceId: base.id }]
    });

    expect(relationLabel(base, override)).toBe('overridden');
  });

  it('uses needs-review for same-name resources with uncertain precedence', () => {
    const left = resource('profile-build', { name: 'build', resourceType: 'skill', status: 'needs-review', metadata: { precedenceOutcome: 'same-name-only' } });
    const right = resource('work-build', { name: 'build', resourceType: 'skill', status: 'needs-review', metadata: { precedenceOutcome: 'same-name-only' } });

    expect(relationLabel(left, right)).toBe('needs-review');
  });

  it('uses no-relationship-inferred when no threshold is met', () => {
    const left = resource('github', { name: 'github', resourceType: 'mcp-server' });
    const right = resource('reviewer', { name: 'reviewer', resourceType: 'skill' });

    expect(relationLabel(left, right)).toBe('no-relationship-inferred');
  });

  it('selects the strongest label from inferred relationships', () => {
    expect(strongestRelationshipLabel([
      inferCapabilityRelationship(resource('a', { name: 'one' }), resource('b', { name: 'two' })),
      inferCapabilityRelationship(resource('c', { name: 'same', path: '/one' }), resource('d', { name: 'same', path: '/one' }))
    ])).toBe('identical');
  });
});
