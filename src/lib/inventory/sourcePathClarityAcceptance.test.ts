import { describe, expect, it } from 'vitest';
import { buildClientDetailModels } from './clientSummary';
import { buildCrossClientViewModel } from './crossClientViewModel';
import { fixtureScenarios, getFixtureScenario } from './fixtures';
import { buildProjectInventoryResources } from './project/effective';
import { buildSafeResourceDetailPanels } from './safeDetailPanels';
import { sourceLocationForResource, unknownSourceLocation } from './sourceClarity';

function visibleSource(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed || unknownSourceLocation;
}

describe('source-path clarity acceptance', () => {
  it('shows source paths or unknown-source labels in Machine Inventory rows', () => {
    const resources = getFixtureScenario('acceptance-machine-inventory').summary.resources;

    expect(resources.length).toBeGreaterThan(0);
    expect(resources.every((resource) => visibleSource(sourceLocationForResource(resource)))).toBe(true);
  });

  it('shows source paths or unknown-source labels in Project Inventory rows', () => {
    const resources = buildProjectInventoryResources(getFixtureScenario('acceptance-project-inventory').summary.resources);

    expect(resources.length).toBeGreaterThan(0);
    expect(resources.every((resource) => visibleSource(sourceLocationForResource(resource)))).toBe(true);
  });

  it('shows source paths or unknown-source labels in Client Detail evidence rows', () => {
    const details = buildClientDetailModels(getFixtureScenario('acceptance-client-detail').summary);
    const evidenceRows = details.flatMap((detail) => detail.evidenceRows);

    expect(evidenceRows.length).toBeGreaterThan(0);
    expect(evidenceRows.every((row) => visibleSource(row.sourcePath ?? row.sourceLabel))).toBe(true);
  });

  it('shows source paths or unknown-source labels in Cross-Client groups and drilldown rows', () => {
    const groups = buildCrossClientViewModel(getFixtureScenario('acceptance-cross-client').summary.resources);

    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((group) => group.sourceLocations.every((source) => visibleSource(source)))).toBe(true);
    expect(groups.every((group) => group.rows.every((row) => visibleSource(row.sourceLocation)))).toBe(true);
  });

  it('shows source paths or explicit unknown-source labels in every resource detail fixture', () => {
    const resources = fixtureScenarios.flatMap((scenario) => scenario.summary.resources);

    expect(resources.length).toBeGreaterThan(0);
    for (const resource of resources) {
      const panels = buildSafeResourceDetailPanels(resource);
      const sourceRows = panels.flatMap((panel) => panel.rows).filter((row) => row.label === 'Source' || row.label.startsWith('Evidence '));
      expect(sourceRows.length).toBeGreaterThan(0);
      expect(sourceRows.every((row) => visibleSource(row.value))).toBe(true);
    }
  });

  it('keeps unknown source explicit when a source cannot be known', () => {
    const resource = getFixtureScenario('acceptance-source-path-clarity').summary.resources.find((item) => item.id === 'acceptance-unknown-source-rule');

    expect(resource).toBeDefined();
    expect(resource ? sourceLocationForResource(resource) : '').toBe(unknownSourceLocation);
  });
});
