import { describe, expect, it } from 'vitest';
import { resource } from '../detectors/common';
import type { CapabilityResource, CapabilityScope } from '../types';
import { createProjectContext } from './context';
import { joinInheritedProjectResources } from './inheritance';

function testResource(overrides: Partial<CapabilityResource> & Pick<CapabilityResource, 'id' | 'client' | 'resourceType'>): CapabilityResource {
  return resource({
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    description: overrides.description ?? 'Test resource.',
    client: overrides.client,
    resourceType: overrides.resourceType,
    scope: overrides.scope ?? 'global',
    status: overrides.status ?? 'found',
    statuses: overrides.statuses,
    path: overrides.path ?? `/fixtures/${overrides.id}`,
    evidence: overrides.evidence ?? [{
      sourcePath: overrides.path ?? `/fixtures/${overrides.id}`,
      scannerRule: 'test-resource',
      matchedPathPattern: 'test',
      readStatus: 'read',
      parseStatus: 'parsed'
    }],
    warnings: overrides.warnings,
    tags: overrides.tags,
    metadata: overrides.metadata
  });
}

describe('project inherited resources', () => {
  it('labels inherited global MCP resources with runtime caveats', () => {
    const context = createProjectContext({ selectedPath: '/repo', repoRootPath: '/repo' });
    const globalMcp = testResource({
      id: 'claude-global-github',
      client: 'claude-desktop',
      resourceType: 'mcp-server',
      scope: 'global' as CapabilityScope
    });

    const result = joinInheritedProjectResources({
      projectResources: [],
      inheritedCandidates: [globalMcp],
      context
    });

    expect(result.inheritedResources[0]).toMatchObject({
      id: 'inherited:claude-global-github',
      status: 'inherited',
      metadata: {
        inherited: true,
        inheritedFromScope: 'global',
        activationConfidence: 'inherited'
      }
    });
    expect(result.inheritedResources[0].metadata.activationStates).toEqual(expect.arrayContaining(['inherited', 'unknown']));
    expect(result.inheritedResources[0].warnings[0].message).toContain('Global MCP inheritance depends');
    expect(result.inheritedResources[0].relationships[0]).toMatchObject({
      kind: 'inherits-from',
      targetResourceId: 'claude-global-github'
    });
  });

  it('marks matching Hermes profile resources as likely active but still caveated', () => {
    const context = createProjectContext({
      selectedPath: '/repo',
      repoRootPath: '/repo',
      activeProfile: 'default'
    });
    const hermesProfile = testResource({
      id: 'hermes-default-docs',
      client: 'hermes',
      resourceType: 'mcp-server',
      scope: 'profile',
      metadata: { profileName: 'default' }
    });

    const result = joinInheritedProjectResources({
      projectResources: [],
      inheritedCandidates: [hermesProfile],
      context
    });

    expect(result.inheritedResources[0].statuses).toContain('likely-active');
    expect(result.inheritedResources[0].metadata.inheritanceCaveats).toEqual([
      'Hermes default profile resources are likely inherited when that profile is active.'
    ]);
  });

  it('adds trust-gated caveats to Codex project layers', () => {
    const context = createProjectContext({ selectedPath: '/repo', repoRootPath: '/repo', trustState: 'unknown' });
    const codexProject = testResource({
      id: 'codex-project-agents',
      client: 'codex',
      resourceType: 'instruction-file',
      scope: 'project-shared',
      status: 'needs-review',
      metadata: { trustGated: true }
    });

    const result = joinInheritedProjectResources({
      projectResources: [codexProject],
      inheritedCandidates: [],
      context
    });

    expect(result.resources[0].metadata).toMatchObject({
      projectLayer: 'trust-gated',
      activationConfidence: 'trust-gated'
    });
    expect(result.resources[0].warnings.some((warning) => warning.message.includes('trust-gated'))).toBe(true);
  });

  it('keeps inherited activation unknown when runtime state cannot prove activation', () => {
    const context = createProjectContext({ selectedPath: '/repo', repoRootPath: '/repo' });
    const globalRule = testResource({
      id: 'cursor-global-rule',
      client: 'cursor',
      resourceType: 'rule',
      scope: 'global'
    });

    const result = joinInheritedProjectResources({
      projectResources: [],
      inheritedCandidates: [globalRule],
      context
    });

    expect(result.inheritedResources[0].metadata.activationStates).toEqual(expect.arrayContaining(['inherited', 'unknown']));
    expect(result.caveats[0]).toContain('depends on client behavior');
  });
});
