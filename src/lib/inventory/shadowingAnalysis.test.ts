import { describe, expect, it } from 'vitest';
import { analyzeProjectGlobalShadowing, applyProjectGlobalShadowing } from './shadowingAnalysis';
import type { CapabilityClient, CapabilityResource, CapabilityResourceType, CapabilityScope } from './types';

function resource(input: {
  id: string;
  name: string;
  client?: CapabilityClient;
  resourceType?: CapabilityResourceType;
  scope: CapabilityScope;
}): CapabilityResource {
  return {
    id: input.id,
    name: input.name,
    description: `${input.name} ${input.scope}`,
    client: input.client ?? 'openclaw',
    resourceType: input.resourceType ?? 'skill',
    scope: input.scope,
    status: 'found',
    path: `/fixtures/${input.id}`,
    evidence: [{
      sourcePath: `/fixtures/${input.id}`,
      scannerRule: 'test-rule',
      matchedPathPattern: input.scope,
      readStatus: 'read',
      parseStatus: 'parsed'
    }],
    warnings: [],
    relationships: [],
    tags: [],
    metadata: {}
  };
}

describe('project/global shadowing analysis', () => {
  it('detects supported OpenClaw project skill shadowing over global/profile resources', () => {
    const global = resource({ id: 'global-build', name: 'build', scope: 'global' });
    const profile = resource({ id: 'profile-build', name: 'build', scope: 'profile' });
    const workspace = resource({ id: 'workspace-build', name: 'build', scope: 'local-private' });
    const analyses = analyzeProjectGlobalShadowing([global, profile, workspace]);
    const annotated = applyProjectGlobalShadowing([global, profile, workspace]);

    expect(analyses.map((analysis) => analysis.label)).toEqual(['shadowed', 'shadowed']);
    expect(analyses.every((analysis) => analysis.winnerResourceId === 'workspace-build')).toBe(true);
    expect(annotated.find((item) => item.id === 'global-build')?.status).toBe('shadowed');
    expect(annotated.find((item) => item.id === 'profile-build')?.relationships[0]).toMatchObject({
      kind: 'shadowed-by',
      targetResourceId: 'workspace-build'
    });
  });

  it('uses needs-review when same-name project/global precedence is uncertain', () => {
    const global = resource({ id: 'global-reviewer', name: 'reviewer', client: 'codex', resourceType: 'skill', scope: 'global' });
    const project = resource({ id: 'project-reviewer', name: 'reviewer', client: 'codex', resourceType: 'skill', scope: 'project-shared' });
    const analyses = analyzeProjectGlobalShadowing([global, project]);
    const annotated = applyProjectGlobalShadowing([global, project]);

    expect(analyses).toHaveLength(1);
    expect(analyses[0]).toMatchObject({
      label: 'needs-review',
      projectResourceId: 'project-reviewer',
      broaderResourceId: 'global-reviewer'
    });
    expect(annotated.find((item) => item.id === 'project-reviewer')?.status).toBe('needs-review');
    expect(annotated.find((item) => item.id === 'project-reviewer')?.metadata.precedenceOutcome).toBe('same-name-only');
  });

  it('does not infer shadowing for different clients or different resource types', () => {
    const global = resource({ id: 'global-reviewer', name: 'reviewer', client: 'codex', resourceType: 'skill', scope: 'global' });
    const projectOtherClient = resource({ id: 'project-reviewer', name: 'reviewer', client: 'claude-code', resourceType: 'skill', scope: 'project-shared' });
    const projectOtherType = resource({ id: 'project-agent', name: 'reviewer', client: 'codex', resourceType: 'custom-agent', scope: 'project-shared' });

    expect(analyzeProjectGlobalShadowing([global, projectOtherClient])).toEqual([]);
    expect(analyzeProjectGlobalShadowing([global, projectOtherType])).toEqual([]);
  });
});
