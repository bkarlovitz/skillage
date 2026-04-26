import { describe, expect, it } from 'vitest';
import { paginate, sortSkillItems, type SortKey } from './table';
import type { SkillItem } from './types';

function skill(overrides: Partial<SkillItem> & Pick<SkillItem, 'id' | 'name'>): SkillItem {
  return {
    id: overrides.id,
    name: overrides.name,
    description: overrides.description ?? `${overrides.name} description`,
    target: overrides.target ?? 'claude-code',
    kind: overrides.kind ?? 'skill',
    scope: overrides.scope ?? 'global',
    path: overrides.path ?? `/tmp/${overrides.name}/SKILL.md`,
    entryFile: overrides.entryFile ?? 'SKILL.md',
    body: overrides.body ?? `# ${overrides.name}`,
    tags: overrides.tags ?? [],
    metadata: overrides.metadata ?? {},
    issues: overrides.issues ?? []
  };
}

function skills(count: number): SkillItem[] {
  return Array.from({ length: count }, (_, index) => skill({ id: `${index + 1}`, name: `skill-${String(index + 1).padStart(2, '0')}` }));
}

describe('paginate', () => {
  it('returns the first page with display bounds', () => {
    const result = paginate(skills(60), { page: 1, pageSize: 25 });

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
    const result = paginate(skills(60), { page: 3, pageSize: 25 });

    expect(result.rows).toHaveLength(10);
    expect(result.rows[0].id).toBe('51');
    expect(result.rows[9].id).toBe('60');
    expect(result.page).toBe(3);
    expect(result.pageCount).toBe(3);
    expect(result.start).toBe(51);
    expect(result.end).toBe(60);
  });

  it('clamps pages above the available range', () => {
    const result = paginate(skills(10), { page: 99, pageSize: 25 });

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

describe('sortSkillItems', () => {
  const rows = [
    skill({ id: '2', name: 'beta', target: 'hermes', scope: 'project', path: '/z/beta.md', issues: [{ severity: 'warning', message: 'Needs description' }] }),
    skill({ id: '1', name: 'Alpha', target: 'codex', scope: 'global', path: '/a/alpha.md', issues: [] }),
    skill({ id: '3', name: 'gamma', target: 'claude-code', scope: 'sample', path: '/m/gamma.md', issues: [
      { severity: 'warning', message: 'One' },
      { severity: 'info', message: 'Two' }
    ] })
  ];

  it('sorts skill names case-insensitively in ascending order', () => {
    expect(sortSkillItems(rows, 'name', 'asc').map((row) => row.name)).toEqual(['Alpha', 'beta', 'gamma']);
  });

  it('sorts issue counts numerically in descending order', () => {
    expect(sortSkillItems(rows, 'issues', 'desc').map((row) => row.id)).toEqual(['3', '2', '1']);
  });

  it('uses name as a deterministic tie-breaker for equal sort values', () => {
    const sameTarget = [
      skill({ id: 'b', name: 'zebra', target: 'codex' }),
      skill({ id: 'a', name: 'apple', target: 'codex' })
    ];

    expect(sortSkillItems(sameTarget, 'target' satisfies SortKey, 'asc').map((row) => row.name)).toEqual(['apple', 'zebra']);
  });

  it('does not mutate the input rows', () => {
    const original = [...rows];

    sortSkillItems(rows, 'path', 'desc');

    expect(rows).toEqual(original);
  });
});
