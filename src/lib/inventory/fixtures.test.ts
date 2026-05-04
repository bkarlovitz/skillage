import { describe, expect, it } from 'vitest';
import { fixtureScenarios, getFixtureScenario, skillItemsFromFixtureScenario, type InventoryFixtureScenarioId } from './fixtures';

describe('inventory fixture scenarios', () => {
  it('defines each required v1 demo scenario explicitly', () => {
    const ids = fixtureScenarios.map((scenario) => scenario.id);

    expect(ids).toEqual([
      'empty-machine',
      'full-machine',
      'project-inherited-globals',
      'duplicate-mcp-names',
      'secret-warning',
      'parse-read-error',
      'not-found-clients'
    ]);
    expect(fixtureScenarios.every((scenario) => scenario.summary.dataSource === 'fixture')).toBe(true);
  });

  it('represents an empty machine without implicit fallback resources', () => {
    const scenario = getFixtureScenario('empty-machine');

    expect(scenario.summary.resources).toEqual([]);
    expect(scenario.summary.knownClientLocations).toHaveLength(6);
    expect(scenario.summary.knownClientLocations.every((location) => location.exists === false)).toBe(true);
  });

  it('covers all supported clients in the full-machine fixture', () => {
    const clients = new Set(getFixtureScenario('full-machine').summary.resources.map((resource) => resource.client));

    expect(clients).toEqual(new Set(['claude-code', 'claude-desktop', 'codex', 'cursor', 'hermes', 'openclaw']));
  });

  it('models inherited globals, duplicates, and not-found clients as separate states', () => {
    const inherited = getFixtureScenario('project-inherited-globals').summary.resources.find((resource) => resource.id === 'project-inherited-global-github');
    const duplicate = getFixtureScenario('duplicate-mcp-names').summary.resources.find((resource) => resource.id === 'duplicate-cursor-github');
    const notFound = getFixtureScenario('not-found-clients').summary.resources;

    expect(inherited?.status).toBe('inherited');
    expect(duplicate?.relationships[0].kind).toBe('similar-to');
    expect(notFound).toHaveLength(6);
    expect(notFound.every((resource) => resource.status === 'not-found')).toBe(true);
  });

  it('keeps secret, read, and parse error fixtures free of raw content', () => {
    const secret = getFixtureScenario('secret-warning').summary.resources[0];
    const parseRead = getFixtureScenario('parse-read-error').summary;

    expect(secret.previewPolicy).toBe('redacted-preview');
    expect(secret.warnings[0].kind).toBe('secret-auth-concern');
    expect(parseRead.parseErrors[0].evidence.parseStatus).toBe('parse-error');
    expect(parseRead.readErrors[0].evidence.readStatus).toBe('unreadable');
    expect('rawContent' in parseRead.parseErrors[0]).toBe(false);
    expect('rawContent' in parseRead.readErrors[0]).toBe(false);
  });

  it('switches fixture scenarios through pure data conversion without scanning', () => {
    const switchFixture = (id: InventoryFixtureScenarioId) => skillItemsFromFixtureScenario(id);

    expect(switchFixture('empty-machine')).toEqual([]);
    expect(switchFixture('full-machine').length).toBeGreaterThan(0);
    expect(switchFixture('secret-warning')[0].metadata.previewPolicy).toBe('redacted-preview');
  });
});
