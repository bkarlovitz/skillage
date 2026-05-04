import { describe, expect, it } from 'vitest';
import { buildCrossClientViewModel, filterCrossClientGroups } from './crossClientViewModel';
import { getFixtureScenario } from './fixtures';

describe('cross-client view model', () => {
  it('renders fixture examples for duplicate MCP, same-name-only skill, and project shadowing', () => {
    const groups = buildCrossClientViewModel(getFixtureScenario('full-machine').summary.resources);

    expect(groups).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'github',
        resourceType: 'mcp-server',
        relationshipLabel: 'duplicate'
      }),
      expect.objectContaining({
        name: 'reviewer',
        resourceType: 'skill',
        relationshipLabel: 'same-name-only'
      }),
      expect.objectContaining({
        name: 'reviewer',
        resourceType: 'skill',
        relationshipLabel: 'shadowed'
      })
    ]));
  });

  it('includes source locations, relationship notes, and drilldown resource ids for grouped entries', () => {
    const groups = buildCrossClientViewModel(getFixtureScenario('full-machine').summary.resources);
    const duplicate = groups.find((group) => group.resourceType === 'mcp-server' && group.relationshipLabel === 'duplicate');

    expect(duplicate?.clients.length).toBeGreaterThan(1);
    expect(duplicate?.sourceLocations.every((source) => source && source !== 'unknown source')).toBe(true);
    expect(duplicate?.notes[0]).toContain('Matching launch evidence');
    expect(duplicate?.rows.every((row) => row.resourceId)).toBe(true);
  });

  it('filters groups by client, resource type, scope, status, warning category, and relationship label', () => {
    const groups = buildCrossClientViewModel(getFixtureScenario('full-machine').summary.resources);

    expect(filterCrossClientGroups(groups, { client: 'codex' }).every((group) => group.clients.includes('codex'))).toBe(true);
    expect(filterCrossClientGroups(groups, { resourceType: 'mcp-server' }).every((group) => group.resourceType === 'mcp-server')).toBe(true);
    expect(filterCrossClientGroups(groups, { scope: 'local-private' }).every((group) => group.scopes.includes('local-private'))).toBe(true);
    expect(filterCrossClientGroups(groups, { status: 'not-tested' }).every((group) => group.statuses.includes('not-tested'))).toBe(true);
    expect(filterCrossClientGroups(groups, { warningCategory: 'duplication-conflict' }).every((group) => group.warningCategories.includes('duplication-conflict'))).toBe(true);
    expect(filterCrossClientGroups(groups, { relationshipLabel: 'shadowed' })).toEqual(expect.arrayContaining([
      expect.objectContaining({ relationshipLabel: 'shadowed' })
    ]));
  });

  it('exposes drilldown ids and source paths for each grouped row', () => {
    const groups = buildCrossClientViewModel(getFixtureScenario('full-machine').summary.resources);

    for (const group of groups) {
      expect(group.rows.every((row) => row.resourceId)).toBe(true);
      expect(group.rows.every((row) => row.sourceLocation && row.sourceLocation !== 'unknown source')).toBe(true);
    }
  });
});
