import { describe, expect, it } from 'vitest';
import { resource } from '../detectors/common';
import type { CapabilityResource } from '../types';
import { projectActivationData, withProjectActivationData } from './activation';

function testResource(overrides: Partial<CapabilityResource> = {}): CapabilityResource {
  return resource({
    id: overrides.id ?? 'project-resource',
    name: overrides.name ?? 'Project resource',
    description: overrides.description ?? 'Project resource.',
    client: overrides.client ?? 'codex',
    resourceType: overrides.resourceType ?? 'instruction-file',
    scope: overrides.scope ?? 'project-shared',
    status: overrides.status ?? 'found',
    statuses: overrides.statuses,
    path: overrides.path ?? '/repo/AGENTS.md',
    evidence: overrides.evidence ?? [{
      sourcePath: overrides.path ?? '/repo/AGENTS.md',
      scannerRule: 'test-resource',
      matchedPathPattern: 'test',
      readStatus: 'read',
      parseStatus: 'parsed'
    }],
    warnings: overrides.warnings,
    metadata: overrides.metadata
  });
}

describe('project activation data', () => {
  it('represents the required activation states as data', () => {
    const states = projectActivationData(testResource({
      status: 'found',
      statuses: ['likely-active', 'inherited', 'needs-review', 'not-tested', 'disabled', 'blocked', 'shadowed', 'overridden'],
      metadata: { trustGated: true }
    })).states;

    expect(states).toEqual(expect.arrayContaining([
      'found',
      'likely-active',
      'inherited',
      'unknown',
      'needs-review',
      'not-tested',
      'trust-gated',
      'disabled',
      'blocked',
      'shadowed',
      'overridden'
    ]));
  });

  it('does not mark project resources active unless active evidence exists', () => {
    const activation = projectActivationData(testResource({
      status: 'found',
      statuses: ['likely-active'],
      metadata: { trustGated: true }
    }));

    expect(activation.states).not.toContain('active');
    expect(activation.activeEvidence).toBe(false);
    expect(activation.confidence).toBe('likely-active');
  });

  it('preserves explicit active evidence when it exists', () => {
    const activation = projectActivationData(testResource({
      status: 'active',
      statuses: ['found', 'active']
    }));

    expect(activation.states).toContain('active');
    expect(activation.activeEvidence).toBe(true);
    expect(activation.confidence).toBe('active');
  });

  it('stores activation states and caveats on resources', () => {
    const output = withProjectActivationData(testResource({
      resourceType: 'mcp-server',
      status: 'needs-review',
      metadata: { tested: false, projectLayer: 'trust-gated' }
    }));

    expect(output.statuses).toEqual(expect.arrayContaining(['needs-review', 'not-tested', 'trust-gated']));
    expect(output.metadata.activationStates).toEqual(expect.arrayContaining(['needs-review', 'not-tested', 'trust-gated']));
    expect(output.metadata.activationCaveats).toEqual(expect.arrayContaining([
      'Configured resource was not runtime-tested.',
      'Activation is trust-gated and must not be treated as active without explicit trust evidence.'
    ]));
  });

  it('uses shadowing states as activation confidence blockers', () => {
    const output = withProjectActivationData(testResource({
      status: 'shadowed',
      statuses: ['found', 'shadowed']
    }));

    expect(output.metadata.activationConfidence).toBe('shadowed');
  });
});
