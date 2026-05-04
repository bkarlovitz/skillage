import { describe, expect, it } from 'vitest';
import { buildClientDetailModels, summarizeCoreClients } from './clientSummary';
import { fixtureScenarios, getFixtureScenario, resourcesFromFixtureScenario, type InventoryFixtureScenarioId } from './fixtures';

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
      'not-found-clients',
      'large-inventory'
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

  it('summarizes all six clients across found, not-found, and partial fixture states', () => {
    const full = summarizeCoreClients(getFixtureScenario('full-machine').summary);
    const notFound = summarizeCoreClients(getFixtureScenario('not-found-clients').summary);
    const partial = summarizeCoreClients(getFixtureScenario('parse-read-error').summary);

    expect(full.map((summary) => summary.client)).toEqual(['claude-code', 'claude-desktop', 'codex', 'cursor', 'hermes', 'openclaw']);
    expect(full.every((summary) => summary.status === 'configured' || summary.status === 'installed')).toBe(true);
    expect(notFound.every((summary) => summary.status === 'not-found')).toBe(true);
    expect(partial.every((summary) => summary.status === 'partially-configured')).toBe(true);
    expect(partial.every((summary) => summary.parseErrorCount > 0 || summary.unreadableCount > 0)).toBe(true);
  });

  it('covers configured, not-found, and partial parse-error client detail states for every client', () => {
    const full = buildClientDetailModels(getFixtureScenario('full-machine').summary);
    const notFound = buildClientDetailModels(getFixtureScenario('not-found-clients').summary);
    const partial = buildClientDetailModels(getFixtureScenario('parse-read-error').summary);

    for (const detail of full) {
      expect(['configured', 'installed']).toContain(detail.status);
      expect(detail.resources.length).toBeGreaterThan(0);
    }

    for (const detail of notFound) {
      expect(detail.status).toBe('not-found');
      expect(detail.knownLocations.every((location) => location.exists === false)).toBe(true);
    }

    for (const detail of partial) {
      expect(detail.status).toBe('partially-configured');
      expect(detail.parseErrors.length + detail.readErrors.length).toBeGreaterThan(0);
      expect(detail.evidenceRows.some((row) => row.parseStatus === 'parse-error' || row.readStatus === 'unreadable')).toBe(true);
    }
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
    const switchFixture = (id: InventoryFixtureScenarioId) => resourcesFromFixtureScenario(id);

    expect(switchFixture('empty-machine')).toEqual([]);
    expect(switchFixture('full-machine').length).toBeGreaterThan(0);
    expect(switchFixture('secret-warning')[0].previewPolicy).toBe('redacted-preview');
  });

  it('provides a generated large fixture without raw file bodies', () => {
    const large = getFixtureScenario('large-inventory').summary.resources;
    const serialized = JSON.stringify(large);

    expect(large).toHaveLength(1200);
    expect(serialized).not.toContain('rawContent');
    expect(large.some((resource) => resource.tags.includes('bucket-1'))).toBe(true);
  });
});
