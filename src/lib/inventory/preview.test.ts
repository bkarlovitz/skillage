import { describe, expect, it } from 'vitest';
import { canShowRawContent, createContentPreview, defaultPreviewPolicy, redactSensitiveText, safeDisplayPreviewText } from './preview';
import type { CapabilityResource, CapabilityResourceType, ContentPreviewPolicy } from './types';
import { contentPreviewPolicies } from './types';

function resource(input: {
  resourceType: CapabilityResourceType;
  path: string;
  previewPolicy: ContentPreviewPolicy;
  previewText?: string;
  rawPreviewAllowed?: boolean;
}): CapabilityResource {
  return {
    id: `preview-${input.resourceType}`,
    name: input.path.split('/').pop() ?? input.resourceType,
    description: 'Preview policy test resource.',
    client: 'codex',
    resourceType: input.resourceType,
    scope: 'global',
    status: 'found',
    path: input.path,
    previewPolicy: input.previewPolicy,
    contentPreview: {
      policy: input.previewPolicy,
      rawPreviewAllowed: input.rawPreviewAllowed ?? false,
      text: input.previewText
    },
    evidence: [{
      sourcePath: input.path,
      scannerRule: 'preview-test',
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

describe('content preview policies', () => {
  it('defines the v1 preview policy vocabulary', () => {
    expect(contentPreviewPolicies).toEqual([
      'metadata-only',
      'redacted-preview',
      'safe-markdown-preview',
      'unread-sensitive'
    ]);
  });

  it('defaults sensitive stores and auth files to unread-sensitive', () => {
    expect(defaultPreviewPolicy({ resourceType: 'sensitive-store', path: '~/.openclaw/auth.json' })).toBe('unread-sensitive');
    expect(defaultPreviewPolicy({ resourceType: 'config-file', path: '/repo/.env' })).toBe('unread-sensitive');

    const preview = createContentPreview('unread-sensitive', 'TOKEN=raw-secret-value');

    expect(preview.rawPreviewAllowed).toBe(false);
    expect(preview.text).toBeUndefined();
  });

  it('defaults logs, sessions, transcripts, cache traces, and memory stores to metadata-only', () => {
    const paths = [
      '~/.claude/logs/app.log',
      '~/.hermes/profiles/default/sessions/1.json',
      '~/.openclaw/transcripts/latest.jsonl',
      '~/.codex/cache/traces/run.json',
      '~/.openclaw/memory/state.json'
    ];

    expect(paths.map((path) => defaultPreviewPolicy({ resourceType: 'log-session-store', path }))).toEqual([
      'metadata-only',
      'metadata-only',
      'metadata-only',
      'metadata-only',
      'metadata-only'
    ]);

    const preview = createContentPreview('metadata-only', 'conversation transcript with bearer token');

    expect(preview.rawPreviewAllowed).toBe(false);
    expect(preview.text).toBeUndefined();
  });

  it('allows raw preview only for safe markdown policy', () => {
    expect(defaultPreviewPolicy({ resourceType: 'instruction-file', path: '/repo/AGENTS.md' })).toBe('safe-markdown-preview');
    expect(canShowRawContent('safe-markdown-preview')).toBe(true);
    expect(canShowRawContent('redacted-preview')).toBe(false);
  });

  it('redacts secret-like values from redacted previews', () => {
    const raw = [
      'api_key = "sk-live-1234567890"',
      'OPENAI_API_KEY=sk-prod-abcdefghijk',
      'Authorization: Bearer abcdefghijklmnopqrstuvwxyz'
    ].join('\n');

    const redacted = redactSensitiveText(raw);
    const preview = createContentPreview('redacted-preview', raw);

    expect(redacted).toContain('[REDACTED]');
    expect(redacted).not.toContain('sk-live-1234567890');
    expect(redacted).not.toContain('sk-prod-abcdefghijk');
    expect(redacted).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(preview.text).toBe(redacted);
    expect(preview.rawPreviewAllowed).toBe(false);
  });

  it('keeps normal inventory previews limited to redacted safe markdown resources', () => {
    const unsafeRows = [
      resource({
        resourceType: 'sensitive-store',
        path: '~/.openclaw/credentials/token.json',
        previewPolicy: 'unread-sensitive',
        previewText: 'raw-token-secret-value',
        rawPreviewAllowed: true
      }),
      resource({
        resourceType: 'log-session-store',
        path: '~/.openclaw/workspaces/repo/memory.json',
        previewPolicy: 'metadata-only',
        previewText: 'raw memory body with bearer token',
        rawPreviewAllowed: true
      }),
      resource({
        resourceType: 'config-file',
        path: '~/.codex/config.toml',
        previewPolicy: 'redacted-preview',
        previewText: 'model = "gpt-test"',
        rawPreviewAllowed: false
      })
    ];
    const markdown = resource({
      resourceType: 'instruction-file',
      path: '/repo/AGENTS.md',
      previewPolicy: 'safe-markdown-preview',
      previewText: '# Instructions\nAPI_TOKEN=raw-secret-value-12345',
      rawPreviewAllowed: true
    });

    expect(unsafeRows.map(safeDisplayPreviewText)).toEqual(['', '', '']);
    expect(safeDisplayPreviewText(markdown)).toContain('[REDACTED]');
    expect(safeDisplayPreviewText(markdown)).not.toContain('raw-secret-value-12345');
  });
});
