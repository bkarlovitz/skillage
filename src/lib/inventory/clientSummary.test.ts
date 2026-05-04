import { describe, expect, it } from 'vitest';
import { buildClientDetailModel, buildClientDetailModels, summarizeCoreClients } from './clientSummary';
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

  it('summarizes Hermes profile-only states with profile counts', () => {
    const summaries = summarizeCoreClients(summary({
      resources: [resource({ id: 'hermes-default', client: 'hermes', resourceType: 'profile', status: 'found', scope: 'profile' })]
    }));
    const hermes = summaries.find((item) => item.client === 'hermes');

    expect(hermes?.status).toBe('configured');
    expect(hermes?.profileCount).toBe(1);
    expect(hermes?.sensitiveStoreCount).toBe(0);
  });

  it('summarizes OpenClaw sensitive-store-only states as installed presence', () => {
    const storeEvidence = baseEvidence('/home/user/.openclaw/auth.json', 'skipped', 'skipped');
    const summaries = summarizeCoreClients(summary({
      resources: [resource({
        id: 'openclaw-auth',
        client: 'openclaw',
        resourceType: 'sensitive-store',
        status: 'sensitive',
        statuses: ['found', 'sensitive'],
        evidence: [storeEvidence]
      })],
      skippedSensitiveStores: [{
        id: 'skipped-openclaw-auth',
        client: 'openclaw',
        resourceType: 'sensitive-store',
        scope: 'global',
        path: '/home/user/.openclaw/auth.json',
        reason: 'Auth store skipped',
        evidence: storeEvidence
      }]
    }));
    const openclaw = summaries.find((item) => item.client === 'openclaw');

    expect(openclaw?.status).toBe('installed');
    expect(openclaw?.sensitiveStoreCount).toBe(2);
    expect(openclaw?.caveats).toContain('Auth store skipped');
  });

  it('marks Hermes parse errors partially configured', () => {
    const parseEvidence = baseEvidence('/home/user/.hermes/config.json', 'parse-error');
    const summaries = summarizeCoreClients(summary({
      resources: [resource({
        id: 'hermes-config',
        client: 'hermes',
        resourceType: 'config-file',
        status: 'parse-error',
        evidence: [parseEvidence]
      })],
      parseErrors: [{
        id: 'hermes-parse',
        client: 'hermes',
        path: '/home/user/.hermes/config.json',
        message: 'Malformed Hermes config',
        evidence: parseEvidence
      }]
    }));

    expect(summaries.find((item) => item.client === 'hermes')?.status).toBe('partially-configured');
  });

  it('reports not-found for absent Hermes and OpenClaw clients', () => {
    const summaries = summarizeCoreClients(summary({
      knownClientLocations: [location('hermes', false), location('openclaw', false)]
    }));

    expect(summaries.find((item) => item.client === 'hermes')?.status).toBe('not-found');
    expect(summaries.find((item) => item.client === 'openclaw')?.status).toBe('not-found');
  });

  it('builds client detail view models with locations, counts, grouped resources, stores, and caveats', () => {
    const parseEvidence = baseEvidence('/home/user/.cursor/mcp.json', 'parse-error');
    const scan = summary({
      resources: [
        resource({
          id: 'cursor-config',
          client: 'cursor',
          resourceType: 'config-file',
          status: 'parse-error',
          evidence: [parseEvidence],
          warnings: [{ kind: 'parse-read-problem', severity: 'error', message: 'Malformed Cursor MCP', evidence: parseEvidence }]
        }),
        resource({
          id: 'cursor-rule',
          client: 'cursor',
          resourceType: 'rule',
          status: 'found'
        })
      ],
      knownClientLocations: [location('cursor', true)],
      parseErrors: [{
        id: 'cursor-parse',
        client: 'cursor',
        path: '/home/user/.cursor/mcp.json',
        message: 'Malformed Cursor MCP',
        evidence: parseEvidence
      }],
      skippedSensitiveStores: [{
        id: 'cursor-skipped',
        client: 'cursor',
        resourceType: 'sensitive-store',
        scope: 'global',
        path: '/home/user/.cursor/auth.json',
        reason: 'Cursor auth skipped',
        evidence: baseEvidence('/home/user/.cursor/auth.json', 'skipped', 'skipped')
      }]
    });

    const detail = buildClientDetailModel(scan, 'cursor');

    expect(detail.status).toBe('partially-configured');
    expect(detail.knownLocations).toHaveLength(1);
    expect(detail.summary.resourceCount).toBe(2);
    expect(detail.summary.sensitiveStoreCount).toBe(1);
    expect(detail.summary.parseErrorCount).toBe(1);
    expect(detail.resourceGroups.map((group) => group.resourceType)).toEqual(['config-file', 'rule']);
    expect(detail.evidenceRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceId: 'cursor-config',
        scannerRule: 'test',
        matchedPathPattern: '/home/user/.cursor/mcp.json',
        readStatus: 'read',
        parseStatus: 'parse-error'
      }),
      expect.objectContaining({
        resourceId: 'cursor-rule',
        sourcePath: '/cursor-rule',
        parseStatus: 'parsed'
      })
    ]));
    expect(detail.parseErrors).toHaveLength(1);
    expect(detail.skippedSensitiveStores).toHaveLength(1);
    expect(detail.caveats).toContain('Malformed Cursor MCP');
  });

  it('exposes config-derived and path-derived source evidence for client detail views', () => {
    const configEvidence: CapabilityEvidence = {
      ...baseEvidence('/repo/.cursor/mcp.json'),
      scannerRule: 'cursor-project-mcp',
      matchedPathPattern: '.cursor/mcp.json',
      parsedKeyPath: 'mcpServers.github',
      includedFromPath: '/repo/.cursor/base.json'
    };
    const pathEvidence: CapabilityEvidence = {
      ...baseEvidence('/repo/.cursor/rules/style.mdc', 'not-applicable'),
      scannerRule: 'cursor-mdc-rule',
      matchedPathPattern: '.cursor/rules/*.mdc'
    };
    const detail = buildClientDetailModel(summary({
      resources: [
        resource({ id: 'cursor-mcp', client: 'cursor', resourceType: 'mcp-server', status: 'found', evidence: [configEvidence] }),
        resource({ id: 'cursor-rule', client: 'cursor', resourceType: 'rule', status: 'found', evidence: [pathEvidence] })
      ]
    }), 'cursor');

    expect(detail.evidenceRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceId: 'cursor-mcp',
        scannerRule: 'cursor-project-mcp',
        matchedPathPattern: '.cursor/mcp.json',
        parsedKeyPath: 'mcpServers.github',
        includedFromPath: '/repo/.cursor/base.json',
        readStatus: 'read',
        parseStatus: 'parsed'
      }),
      expect.objectContaining({
        resourceId: 'cursor-rule',
        scannerRule: 'cursor-mdc-rule',
        matchedPathPattern: '.cursor/rules/*.mdc',
        sourcePath: '/repo/.cursor/rules/style.mdc',
        readStatus: 'read',
        parseStatus: 'not-applicable'
      })
    ]));
  });

  it('builds detail view models for every supported client state', () => {
    const details = buildClientDetailModels(summary({
      resources: [
        resource({ id: 'claude-code-config', client: 'claude-code', resourceType: 'config-file', status: 'found' }),
        resource({ id: 'cursor-config', client: 'cursor', resourceType: 'config-file', status: 'parse-error', evidence: [baseEvidence('/cursor', 'parse-error')] })
      ],
      knownClientLocations: [
        location('claude-code', true),
        location('claude-desktop', true),
        location('codex', false),
        location('cursor', true)
      ],
      parseErrors: [{
        id: 'cursor-parse',
        client: 'cursor',
        path: '/cursor',
        message: 'Cursor parse failed',
        evidence: baseEvidence('/cursor', 'parse-error')
      }]
    }));

    expect(details.map((detail) => detail.client)).toEqual(['claude-code', 'claude-desktop', 'codex', 'cursor', 'hermes', 'openclaw']);
    expect(details.find((detail) => detail.client === 'claude-code')?.status).toBe('configured');
    expect(details.find((detail) => detail.client === 'claude-desktop')?.status).toBe('installed');
    expect(details.find((detail) => detail.client === 'codex')?.status).toBe('not-found');
    expect(details.find((detail) => detail.client === 'cursor')?.status).toBe('partially-configured');
  });
});
