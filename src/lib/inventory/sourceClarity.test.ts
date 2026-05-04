import { describe, expect, it } from 'vitest';
import { buildCrossClientViewModel } from './crossClientViewModel';
import { fixtureScenarios } from './fixtures';
import { sourceClarityForResource, sourceLocationForResource, unknownSourceLocation } from './sourceClarity';
import type { CapabilityResource } from './types';

function unknownRule(id: string, client: CapabilityResource['client']): CapabilityResource {
  return {
    id,
    name: 'shared-rule',
    description: 'Rule without a known source.',
    client,
    resourceType: 'rule',
    scope: 'global',
    status: 'found',
    evidence: [{
      scannerRule: 'test-source-clarity',
      matchedPathPattern: 'unknown',
      readStatus: 'read',
      parseStatus: 'not-applicable'
    }],
    warnings: [],
    relationships: [],
    tags: [],
    metadata: {}
  };
}

describe('source clarity', () => {
  it('chooses path, evidence path, evidence label, or explicit unknown source', () => {
    expect(sourceLocationForResource({
      ...unknownRule('with-path', 'codex'),
      path: '/repo/.codex/rules/shared-rule.md'
    })).toBe('/repo/.codex/rules/shared-rule.md');
    expect(sourceLocationForResource({
      ...unknownRule('with-evidence-path', 'codex'),
      evidence: [{
        sourcePath: '/repo/AGENTS.md',
        scannerRule: 'test-source-clarity',
        matchedPathPattern: 'AGENTS.md',
        readStatus: 'read',
        parseStatus: 'parsed'
      }]
    })).toBe('/repo/AGENTS.md');
    expect(sourceLocationForResource({
      ...unknownRule('with-label', 'codex'),
      evidence: [{
        sourceLabel: 'Selected project scan root',
        scannerRule: 'test-source-clarity',
        matchedPathPattern: 'scan-root',
        readStatus: 'read',
        parseStatus: 'not-applicable'
      }]
    })).toBe('Selected project scan root');
    expect(sourceLocationForResource(unknownRule('unknown', 'codex'))).toBe(unknownSourceLocation);
  });

  it('makes every fixture resource either source-known or explicitly unknown', () => {
    for (const scenario of fixtureScenarios) {
      for (const resource of scenario.summary.resources) {
        const clarity = sourceClarityForResource(resource);
        expect(clarity.sourceLocation).toBeTruthy();
        expect(clarity.known || clarity.sourceLocation === unknownSourceLocation).toBe(true);
      }
    }
  });

  it('keeps grouped capabilities source-clear when all sources are unknown', () => {
    const groups = buildCrossClientViewModel([
      unknownRule('unknown-rule-codex', 'codex'),
      unknownRule('unknown-rule-cursor', 'cursor')
    ]);
    const group = groups.find((item) => item.name === 'shared-rule');

    expect(group?.sourceLocations).toEqual([unknownSourceLocation]);
    expect(group?.rows.every((row) => row.sourceLocation === unknownSourceLocation)).toBe(true);
  });
});
