import { describe, expect, it } from 'vitest';
import { getFixtureScenario } from './fixtures';
import { buildLocalScanResult } from './localScan';

describe('local scan result behavior', () => {
  it('keeps an empty local scan empty instead of loading fixture data', () => {
    const fixtureResources = getFixtureScenario('full-machine').summary.resources;
    const result = buildLocalScanResult({
      scanId: 'test-empty-local-scan',
      rootPath: '/tmp/empty-project',
      rootLabel: 'Selected scan root',
      scannerRule: 'selected-root',
      matchedPathPattern: '/tmp/empty-project',
      dataSourceLabel: 'Local scan: /tmp/empty-project',
      resources: [],
      loadedStatus: 'Loaded local resources.',
      emptyStatus: 'No matching capabilities found in the selected root.'
    });

    expect(fixtureResources.length).toBeGreaterThan(0);
    expect(result.resources).toEqual([]);
    expect(result.summary.resources).toEqual([]);
    expect(result.selectedId).toBe('');
    expect(result.summary.dataSource).toBe('local-scan');
    expect(result.statusText).toBe('No matching capabilities found in the selected root.');
  });
});
