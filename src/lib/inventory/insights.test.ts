import { describe, expect, it } from 'vitest';
import { buildInventoryInsights, insightCategories, insightCounts } from './insights';
import { createEmptyScanSummary } from './scan';
import type { RelationshipInference } from './relationships';
import type { CapabilityResource, CapabilityWarningKind } from './types';

function resource(id: string, warningKind: CapabilityWarningKind, message: string): CapabilityResource {
  return {
    id,
    name: id,
    description: id,
    client: 'codex',
    resourceType: 'config-file',
    scope: 'project-shared',
    status: 'found',
    path: `/fixtures/${id}`,
    evidence: [{
      sourcePath: `/fixtures/${id}`,
      scannerRule: 'test-rule',
      matchedPathPattern: id,
      readStatus: 'read',
      parseStatus: 'parsed'
    }],
    warnings: [{ kind: warningKind, severity: 'warning', message }],
    relationships: [],
    tags: [],
    metadata: {}
  };
}

describe('inventory insight aggregation', () => {
  it('defines every V1 warning category for insights', () => {
    expect(insightCategories).toEqual([
      'parse-read-problem',
      'scope-concern',
      'duplication-conflict',
      'secret-auth-concern',
      'runtime-caveat'
    ]);
  });

  it('aggregates resource warnings, scanner records, skipped stores, and relationships by category', () => {
    const relationship: RelationshipInference = {
      label: 'duplicate',
      evidence: ['same-resource-type', 'same-normalized-name', 'same-launch-signature'],
      note: 'Duplicate MCP launch evidence.',
      sourceResourceId: 'mcp-one',
      targetResourceId: 'mcp-two'
    };
    const summary = createEmptyScanSummary({
      resources: [
        resource('scope', 'scope-concern', 'Project scope needs review.'),
        resource('runtime', 'runtime-caveat', 'MCP server was not tested.'),
        resource('duplicate', 'duplication-conflict', 'Same-name skill collision.'),
        resource('secret', 'secret-auth-concern', 'Token-like value found.')
      ],
      readErrors: [{
        id: 'read-error',
        client: 'cursor',
        path: '/repo/.cursor/mcp.json',
        message: 'Permission denied.',
        evidence: {
          sourcePath: '/repo/.cursor/mcp.json',
          scannerRule: 'cursor',
          matchedPathPattern: 'mcp.json',
          readStatus: 'unreadable',
          parseStatus: 'skipped'
        }
      }],
      parseErrors: [{
        id: 'parse-error',
        client: 'hermes',
        path: '~/.hermes/config.yaml',
        message: 'Could not parse YAML.',
        evidence: {
          sourcePath: '~/.hermes/config.yaml',
          scannerRule: 'hermes',
          matchedPathPattern: 'config.yaml',
          readStatus: 'read',
          parseStatus: 'parse-error'
        }
      }],
      skippedSensitiveStores: [{
        id: 'skipped-auth',
        client: 'openclaw',
        resourceType: 'sensitive-store',
        scope: 'global',
        path: '~/.openclaw/auth.json',
        reason: 'Auth store skipped.',
        evidence: {
          sourcePath: '~/.openclaw/auth.json',
          scannerRule: 'openclaw',
          matchedPathPattern: 'auth.json',
          readStatus: 'skipped',
          parseStatus: 'skipped'
        }
      }],
      warnings: [{
        id: 'gateway',
        severity: 'warning',
        message: 'Gateway/remote runtime mode may hide state.',
        client: 'openclaw'
      }]
    });
    const insights = buildInventoryInsights(summary, [relationship]);
    const counts = insightCounts(insights);

    expect(counts['parse-read-problem']).toBe(2);
    expect(counts['scope-concern']).toBe(1);
    expect(counts['duplication-conflict']).toBe(2);
    expect(counts['secret-auth-concern']).toBe(2);
    expect(counts['runtime-caveat']).toBe(2);
    expect(insights.find((insight) => insight.source === 'relationship-analysis')?.message).toContain('duplicate');
  });

  it('categorizes scanner warnings by message when no warning kind exists', () => {
    const insights = buildInventoryInsights(createEmptyScanSummary({
      warnings: [{
        id: 'missing-include',
        severity: 'warning',
        message: 'Included config is missing or unreadable.'
      }, {
        id: 'collab',
        severity: 'info',
        message: 'Local/private file may not be visible to collaborators.'
      }, {
        id: 'auth',
        severity: 'warning',
        message: 'Credential reference found.'
      }]
    }));

    expect(insights.map((insight) => insight.category)).toEqual([
      'parse-read-problem',
      'scope-concern',
      'secret-auth-concern'
    ]);
  });
});
