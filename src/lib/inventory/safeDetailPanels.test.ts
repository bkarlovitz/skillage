import { describe, expect, it } from 'vitest';
import { buildSafeResourceDetailPanels } from './safeDetailPanels';
import type { CapabilityResource, CapabilityResourceType, ContentPreviewPolicy } from './types';

function resource(input: {
  resourceType: CapabilityResourceType;
  path: string;
  previewPolicy?: ContentPreviewPolicy;
  previewText?: string;
  rawPreviewAllowed?: boolean;
}): CapabilityResource {
  return {
    id: `test-${input.resourceType}`,
    name: input.path.split('/').pop() ?? input.resourceType,
    description: 'Test resource',
    client: 'codex',
    resourceType: input.resourceType,
    scope: 'global',
    status: 'found',
    path: input.path,
    previewPolicy: input.previewPolicy,
    contentPreview: input.previewPolicy
      ? {
        policy: input.previewPolicy,
        rawPreviewAllowed: input.rawPreviewAllowed ?? false,
        text: input.previewText
      }
      : undefined,
    evidence: [{
      sourcePath: input.path,
      scannerRule: 'test-rule',
      matchedPathPattern: input.path,
      readStatus: 'read',
      parseStatus: 'parsed'
    }],
    warnings: [],
    relationships: [],
    tags: [],
    metadata: {}
  };
}

describe('safe resource detail panels', () => {
  it('shows body text only for safe markdown instruction, skill, and rule resources', () => {
    const panels = buildSafeResourceDetailPanels(resource({
      resourceType: 'instruction-file',
      path: '/repo/AGENTS.md',
      previewPolicy: 'safe-markdown-preview',
      previewText: '# Project instructions',
      rawPreviewAllowed: true
    }));

    expect(panels[0].title).toBe('Safe Markdown Preview');
    expect(panels[0].previewText).toBe('# Project instructions');
  });

  it('redacts secret-like values even inside safe markdown previews', () => {
    const panels = buildSafeResourceDetailPanels(resource({
      resourceType: 'instruction-file',
      path: '/repo/AGENTS.md',
      previewPolicy: 'safe-markdown-preview',
      previewText: '# Project instructions\nAPI_TOKEN=raw-secret-value-12345',
      rawPreviewAllowed: true
    }));

    expect(panels[0].previewText).toContain('[REDACTED]');
    expect(panels[0].previewText).not.toContain('raw-secret-value-12345');
  });

  it('keeps configs metadata-only even when redacted preview text exists', () => {
    const panels = buildSafeResourceDetailPanels(resource({
      resourceType: 'config-file',
      path: '/repo/.cursor/mcp.json',
      previewPolicy: 'redacted-preview',
      previewText: '{"mcpServers":{"github":{"env":{"API_TOKEN":"[REDACTED]"}}}}'
    }));
    const serialized = JSON.stringify(panels);

    expect(panels[0]).toMatchObject({
      title: 'Safe Metadata Panel',
      previewText: undefined
    });
    expect(serialized).not.toContain('mcpServers');
    expect(serialized).toContain('metadata only');
  });

  it('never exposes sensitive store bodies even if bad input carries raw preview text', () => {
    const panels = buildSafeResourceDetailPanels(resource({
      resourceType: 'sensitive-store',
      path: '~/.openclaw/credentials/token.json',
      previewPolicy: 'unread-sensitive',
      previewText: 'raw-token-secret-value',
      rawPreviewAllowed: true
    }));
    const serialized = JSON.stringify(panels);

    expect(panels[0].previewText).toBeUndefined();
    expect(serialized).not.toContain('raw-token-secret-value');
    expect(serialized).toContain('Sensitive source content is not read or displayed.');
  });

  it('keeps logs, sessions, and memory stores metadata-only', () => {
    const panels = buildSafeResourceDetailPanels(resource({
      resourceType: 'log-session-store',
      path: '~/.openclaw/workspaces/repo/memory.json',
      previewPolicy: 'metadata-only',
      previewText: 'raw session transcript'
    }));
    const serialized = JSON.stringify(panels);

    expect(panels[0].previewText).toBeUndefined();
    expect(serialized).not.toContain('raw session transcript');
    expect(panels[0].rows).toEqual(expect.arrayContaining([
      { label: 'Body preview', value: 'metadata only' }
    ]));
  });

  it('preserves source evidence as metadata rows', () => {
    const panels = buildSafeResourceDetailPanels(resource({
      resourceType: 'mcp-server',
      path: '~/.codex/config.toml',
      previewPolicy: 'redacted-preview'
    }));

    expect(panels[1].rows).toEqual(expect.arrayContaining([
      { label: 'Rule 1', value: 'test-rule' },
      { label: 'Read/parse 1', value: 'read / parsed' }
    ]));
  });
});
