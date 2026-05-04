import { describe, expect, it } from 'vitest';
import { buildCrossClientViewModel } from './crossClientViewModel';
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
});
