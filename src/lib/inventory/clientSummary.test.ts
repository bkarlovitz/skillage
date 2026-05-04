import { describe, expect, it } from 'vitest';
import { summarizeCoreClients } from './clientSummary';
import { createEmptyScanSummary, type KnownClientLocation, type ScanSummary } from './scan';
import type { CapabilityClient, CapabilityEvidence, CapabilityResource } from './types';

function baseEvidence(path: string, parseStatus: CapabilityEvidence['parseStatus'] = 'parsed', readStatus: CapabilityEvidence['readStatus'] = 'read'): CapabilityEvidence {
  return {
    sourcePath: path,
    scannerRule: 'test',
    matchedPathPattern: path,
    readStatus,
    parseStatus
  };
}

function resource(input: Partial<CapabilityResource> & Pick<CapabilityResource, 'id' | 'client' | 'resourceType' | 'status'>): CapabilityResource {
  return {
    name: input.id,
    description: input.id,
    scope: 'global',
    evidence: [baseEvidence(`/${input.id}`)],
    warnings: [],
    relationships: [],
    tags: [],
    metadata: {},
    ...input
  } as CapabilityResource;
}

function location(client: CapabilityClient, exists: boolean): KnownClientLocation {
  return {
    client,
    label: `${client} home`,
    path: `/home/user/${client}`,
    exists,
    scope: 'global',
    resourceType: 'config-file',
    evidence: baseEvidence(`/home/user/${client}`, 'not-applicable', exists ? 'read' : 'not-found')
  };
}

function summary(overrides: Partial<ScanSummary>): ScanSummary {
  return createEmptyScanSummary({ id: 'test', generatedAt: '2026-01-01T00:00:00.000Z', dataSource: 'fixture', ...overrides });
}

describe('core client summaries', () => {
  it('marks clients configured when parseable config resources exist', () => {
    const summaries = summarizeCoreClients(summary({
      resources: [resource({ id: 'cursor-config', client: 'cursor', resourceType: 'config-file', status: 'found' })],
      knownClientLocations: [location('cursor', true)]
    }));
    const cursor = summaries.find((item) => item.client === 'cursor');

    expect(cursor?.status).toBe('configured');
    expect(cursor?.readableCount).toBe(1);
    expect(cursor?.parseableCount).toBe(1);
  });

  it('marks clients installed when only known locations exist', () => {
    const summaries = summarizeCoreClients(summary({
      knownClientLocations: [location('claude-code', true)]
    }));

    expect(summaries.find((item) => item.client === 'claude-code')?.status).toBe('installed');
  });

  it('marks absent clients not-found', () => {
    const summaries = summarizeCoreClients(summary({
      knownClientLocations: [location('codex', false)]
    }));

    expect(summaries.find((item) => item.client === 'codex')?.status).toBe('not-found');
  });

  it('marks parse-error states partially configured with caveats', () => {
    const parseEvidence = baseEvidence('/repo/.cursor/mcp.json', 'parse-error');
    const summaries = summarizeCoreClients(summary({
      resources: [resource({
        id: 'cursor-parse-error',
        client: 'cursor',
        resourceType: 'config-file',
        status: 'parse-error',
        evidence: [parseEvidence],
        warnings: [{ kind: 'parse-read-problem', severity: 'error', message: 'Unexpected token', evidence: parseEvidence }]
      })],
      parseErrors: [{
        id: 'parse-error',
        client: 'cursor',
        path: '/repo/.cursor/mcp.json',
        message: 'Unexpected token',
        evidence: parseEvidence
      }]
    }));
    const cursor = summaries.find((item) => item.client === 'cursor');

    expect(cursor?.status).toBe('partially-configured');
    expect(cursor?.parseErrorCount).toBe(1);
    expect(cursor?.caveats).toContain('Unexpected token');
  });

  it('marks read-error states partially configured', () => {
    const readEvidence = baseEvidence('/home/user/.codex/config.toml', 'skipped', 'unreadable');
    const summaries = summarizeCoreClients(summary({
      readErrors: [{
        id: 'read-error',
        client: 'codex',
        path: '/home/user/.codex/config.toml',
        message: 'Permission denied',
        evidence: readEvidence
      }]
    }));
    const codex = summaries.find((item) => item.client === 'codex');

    expect(codex?.status).toBe('partially-configured');
    expect(codex?.warningCount).toBe(1);
    expect(codex?.caveats).toEqual(['Permission denied']);
  });
});
