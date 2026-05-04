import { describe, expect, it } from 'vitest';
import { paginate, sortCapabilityResources, type SortKey } from './table';
import type { CapabilityResource } from './inventory/types';

function resource(overrides: Partial<CapabilityResource> & Pick<CapabilityResource, 'id' | 'name'>): CapabilityResource {
  return {
    id: overrides.id,
    name: overrides.name,
    description: overrides.description ?? `${overrides.name} description`,
    client: overrides.client ?? 'claude-code',
    resourceType: overrides.resourceType ?? 'skill',
    scope: overrides.scope ?? 'global',
    status: overrides.status ?? 'found',
    path: overrides.path ?? `/tmp/${overrides.name}/SKILL.md`,
    previewPolicy: overrides.previewPolicy ?? 'safe-markdown-preview',
    evidence: overrides.evidence ?? [{
      sourcePath: overrides.path ?? `/tmp/${overrides.name}/SKILL.md`,
      scannerRule: 'test',
      matchedPathPattern: 'test',
      readStatus: 'read',
      parseStatus: 'parsed'
    }],
    tags: overrides.tags ?? [],
    metadata: overrides.metadata ?? {},
    warnings: overrides.warnings ?? [],
    relationships: overrides.relationships ?? []
  };
}

function resources(count: number): CapabilityResource[] {
  return Array.from({ length: count }, (_, index) => resource({ id: `${index + 1}`, name: `skill-${String(index + 1).padStart(2, '0')}` }));
}

describe('paginate', () => {
  it('returns the first page with display bounds', () => {
    const result = paginate(resources(60), { page: 1, pageSize: 25 });

    expect(result.rows).toHaveLength(25);
    expect(result.rows[0].id).toBe('1');
    expect(result.rows[24].id).toBe('25');
    expect(result.page).toBe(1);
    expect(result.pageCount).toBe(3);
    expect(result.total).toBe(60);
    expect(result.start).toBe(1);
    expect(result.end).toBe(25);
  });

  it('returns the final partial page with display bounds', () => {
    const result = paginate(resources(60), { page: 3, pageSize: 25 });

    expect(result.rows).toHaveLength(10);
    expect(result.rows[0].id).toBe('51');
    expect(result.rows[9].id).toBe('60');
    expect(result.page).toBe(3);
    expect(result.pageCount).toBe(3);
    expect(result.start).toBe(51);
    expect(result.end).toBe(60);
  });

  it('clamps pages above the available range', () => {
    const result = paginate(resources(10), { page: 99, pageSize: 25 });

    expect(result.page).toBe(1);
    expect(result.pageCount).toBe(1);
    expect(result.rows).toHaveLength(10);
  });

  it('handles empty rows without invalid display bounds', () => {
    const result = paginate([], { page: 4, pageSize: 25 });

    expect(result.rows).toEqual([]);
    expect(result.page).toBe(1);
    expect(result.pageCount).toBe(1);
    expect(result.total).toBe(0);
    expect(result.start).toBe(0);
    expect(result.end).toBe(0);
  });
});

describe('sortCapabilityResources', () => {
  const rows = [
    resource({ id: '2', name: 'beta', client: 'hermes', scope: 'project-shared', path: '/z/beta.md', warnings: [{ kind: 'scope-concern', severity: 'warning', message: 'Needs description' }] }),
    resource({ id: '1', name: 'Alpha', client: 'codex', scope: 'global', path: '/a/alpha.md', warnings: [] }),
    resource({ id: '3', name: 'gamma', client: 'claude-code', scope: 'unknown', path: '/m/gamma.md', warnings: [
      { kind: 'scope-concern', severity: 'warning', message: 'One' },
      { kind: 'runtime-caveat', severity: 'info', message: 'Two' }
    ] })
  ];

  it('sorts capability names case-insensitively in ascending order', () => {
    expect(sortCapabilityResources(rows, 'name', 'asc').map((row) => row.name)).toEqual(['Alpha', 'beta', 'gamma']);
  });

  it('sorts warning counts numerically in descending order', () => {
    expect(sortCapabilityResources(rows, 'warnings', 'desc').map((row) => row.id)).toEqual(['3', '2', '1']);
  });

  it('uses name as a deterministic tie-breaker for equal sort values', () => {
    const sameClient = [
      resource({ id: 'b', name: 'zebra', client: 'codex' }),
      resource({ id: 'a', name: 'apple', client: 'codex' })
    ];

    expect(sortCapabilityResources(sameClient, 'client' satisfies SortKey, 'asc').map((row) => row.name)).toEqual(['apple', 'zebra']);
  });

  it('does not mutate the input rows', () => {
    const original = [...rows];

    sortCapabilityResources(rows, 'path', 'desc');

    expect(rows).toEqual(original);
  });
});
