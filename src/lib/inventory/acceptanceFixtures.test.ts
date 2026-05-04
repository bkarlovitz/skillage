import { describe, expect, it } from 'vitest';
import { buildClientDetailModels, summarizeCoreClients } from './clientSummary';
import { buildCrossClientViewModel } from './crossClientViewModel';
import { getFixtureScenario } from './fixtures';
import { buildInventoryInsights } from './insights';
import { buildProjectEffectiveResources, buildProjectInventoryResources } from './project/effective';
import { safeDisplayPreviewText } from './preview';
import { buildSafeResourceDetailPanels } from './safeDetailPanels';
import { sourceClarityForResource, unknownSourceLocation } from './sourceClarity';
import { capabilityClients } from './types';

describe('v1 acceptance fixtures', () => {
  it('loads the machine inventory outcome with client, source, store, and error visibility', () => {
    const summary = getFixtureScenario('acceptance-machine-inventory').summary;
    const clientSummaries = summarizeCoreClients(summary);
    const resourceTypes = new Set(summary.resources.map((resource) => resource.resourceType));

    expect(clientSummaries.map((client) => client.client)).toEqual([...capabilityClients]);
    expect(clientSummaries.every((client) => client.status === 'configured' || client.status === 'partially-configured' || client.status === 'installed')).toBe(true);
    expect([...resourceTypes]).toEqual(expect.arrayContaining([
      'config-file',
      'mcp-server',
      'skill',
      'instruction-file',
      'rule',
      'hook',
      'plugin',
      'sensitive-store',
      'log-session-store'
    ]));
    expect(summary.resources.every((resource) => sourceClarityForResource(resource).sourceLocation)).toBe(true);
    expect(summary.parseErrors.length).toBeGreaterThan(0);
    expect(summary.readErrors.length).toBeGreaterThan(0);
  });

  it('loads the project inventory outcome with project, inherited, risk, and effective rows visible', () => {
    const summary = getFixtureScenario('acceptance-project-inventory').summary;
    const projectRows = buildProjectInventoryResources(summary.resources);
    const effectiveRows = buildProjectEffectiveResources(summary.resources);
    const insights = buildInventoryInsights(summary);

    expect(summary.selectedProject?.displayName).toBe('repo');
    expect(projectRows.some((resource) => resource.scope === 'project-shared')).toBe(true);
    expect(projectRows.some((resource) => resource.scope === 'local-private')).toBe(true);
    expect(projectRows.some((resource) => (resource.statuses ?? [resource.status]).includes('inherited'))).toBe(true);
    expect(projectRows.some((resource) => resource.metadata.collaboratorVisibility === 'shared')).toBe(true);
    expect(projectRows.some((resource) => resource.warnings.some((warning) => warning.kind === 'secret-auth-concern' || warning.kind === 'runtime-caveat'))).toBe(true);
    expect(effectiveRows.length).toBeGreaterThan(0);
    expect(insights.some((insight) => insight.category === 'scope-concern' || insight.category === 'secret-auth-concern')).toBe(true);
  });

  it('loads the client detail outcome with known locations, evidence, resource groups, and caveats', () => {
    const details = buildClientDetailModels(getFixtureScenario('acceptance-client-detail').summary);

    expect(details.map((detail) => detail.client)).toEqual([...capabilityClients]);
    for (const detail of details) {
      expect(detail.knownLocations.length).toBeGreaterThan(0);
      expect(detail.resourceGroups.length).toBeGreaterThan(0);
      expect(detail.evidenceRows.length).toBeGreaterThan(0);
    }
    expect(details.some((detail) => detail.caveats.length > 0)).toBe(true);
    expect(details.some((detail) => detail.parseErrors.length + detail.readErrors.length > 0)).toBe(true);
  });

  it('loads the cross-client outcome with duplicate, same-name-only, and shadowing groups visible', () => {
    const groups = buildCrossClientViewModel(getFixtureScenario('acceptance-cross-client').summary.resources);

    expect(groups).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'github', resourceType: 'mcp-server', relationshipLabel: 'duplicate' }),
      expect.objectContaining({ name: 'reviewer', resourceType: 'skill', relationshipLabel: 'same-name-only' }),
      expect.objectContaining({ name: 'reviewer', resourceType: 'skill', relationshipLabel: 'shadowed' })
    ]));
    expect(groups.every((group) => group.clients.length > 0 && group.scopes.length > 0 && group.sourceLocations.length > 0)).toBe(true);
  });

  it('loads the source-path clarity outcome with known paths or explicit unknown-source labels', () => {
    const resources = getFixtureScenario('acceptance-source-path-clarity').summary.resources;
    const clarity = resources.map(sourceClarityForResource);

    expect(clarity.some((item) => item.known)).toBe(true);
    expect(clarity.some((item) => item.sourceLocation === unknownSourceLocation)).toBe(true);
    expect(clarity.every((item) => item.sourceLocation)).toBe(true);
  });

  it('loads the safety outcome without user-visible raw secret, log, session, or memory bodies', () => {
    const resources = getFixtureScenario('acceptance-safety').summary.resources;
    const serializedPanels = JSON.stringify(resources.flatMap(buildSafeResourceDetailPanels));

    expect(resources.some((resource) => resource.resourceType === 'sensitive-store')).toBe(true);
    expect(resources.some((resource) => resource.resourceType === 'log-session-store')).toBe(true);
    expect(resources.some((resource) => resource.warnings.some((warning) => warning.kind === 'secret-auth-concern'))).toBe(true);
    expect(resources.every((resource) => safeDisplayPreviewText(resource) === '')).toBe(true);
    expect(serializedPanels).not.toContain('raw');
    expect(serializedPanels).toContain('metadata only');
  });
});
