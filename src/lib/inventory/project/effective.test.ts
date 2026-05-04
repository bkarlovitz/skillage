import { describe, expect, it } from 'vitest';
import { buildCrossClientViewModel } from '../crossClientViewModel';
import { getFixtureScenario } from '../fixtures';
import { buildProjectEffectiveResources } from './effective';

describe('project effective resources', () => {
  it('uses the shared shadowing model consistently with cross-client groups', () => {
    const resources = getFixtureScenario('full-machine').summary.resources;
    const projectRows = buildProjectEffectiveResources(resources);
    const crossClientGroups = buildCrossClientViewModel(resources);
    const projectShadowed = projectRows.find((resource) => resource.id === 'full-openclaw-global-skill');
    const crossClientShadowed = crossClientGroups.find((group) => group.key === 'shadow:full-openclaw-workspace-skill:full-openclaw-global-skill');

    expect(projectShadowed).toMatchObject({
      status: 'shadowed',
      metadata: {
        activationConfidence: 'shadowed',
        precedenceOutcome: 'shadowed',
        shadowedBy: 'full-openclaw-workspace-skill'
      }
    });
    expect(projectShadowed?.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'shadowed-by',
        targetResourceId: 'full-openclaw-workspace-skill'
      })
    ]));
    expect(crossClientShadowed).toMatchObject({
      name: 'reviewer',
      resourceType: 'skill',
      relationshipLabel: 'shadowed'
    });
    expect(crossClientShadowed?.relationships[0]).toMatchObject({
      label: 'shadowed',
      sourceResourceId: 'full-openclaw-workspace-skill',
      targetResourceId: 'full-openclaw-global-skill'
    });
    expect(projectShadowed?.metadata.shadowedBy).toBe(crossClientShadowed?.relationships[0]?.sourceResourceId);
  });
});
