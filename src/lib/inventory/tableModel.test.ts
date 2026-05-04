import { describe, expect, it } from 'vitest';
import { paginate, sortCapabilityResources } from '../table';
import { filterCapabilityResources, resourceSearchText } from './tableModel';
import type { CapabilityClient, CapabilityResource } from './types';

function resource(index: number, overrides: Partial<CapabilityResource> = {}): CapabilityResource {
  const client: CapabilityClient = ['claude-code', 'claude-desktop', 'codex', 'cursor'][index % 4] as CapabilityClient;
  return {
    id: `large-${index}`,
    name: `Resource ${index}`,
    description: `Generated resource ${index}`,
    client,
    resourceType: index % 3 === 0 ? 'mcp-server' : 'config-file',
    scope: index % 2 === 0 ? 'global' : 'project-shared',
    status: 'found',
    path: `/repo/generated/${index}.json`,
    evidence: [{
      sourcePath: `/repo/generated/${index}.json`,
      scannerRule: 'large-fixture',
      matchedPathPattern: '*.json',
      readStatus: 'read',
      parseStatus: 'parsed'
    }],
    warnings: [],
    relationships: [],
    tags: [`bucket-${index % 50}`],
    metadata: {
      index,
      bucket: `bucket-${index % 50}`
    },
    ...overrides
  };
}

describe('inventory table model', () => {
  it('searches metadata and redacted previews without raw body dependency', () => {
    const item = resource(1, {
      contentPreview: {
        policy: 'safe-markdown-preview',
        rawPreviewAllowed: true,
        text: 'raw-body-only-needle'
      },
      metadata: {
        bucket: 'metadata-needle'
      }
    }) as CapabilityResource & { rawContent: string };
    item.rawContent = 'raw-content-only-needle';
    const redacted = resource(2, {
      contentPreview: {
        policy: 'redacted-preview',
        rawPreviewAllowed: false,
        text: 'redacted-preview-needle'
      }
    });

    expect(resourceSearchText(item)).toContain('metadata-needle');
    expect(resourceSearchText(item)).not.toContain('raw-body-only-needle');
    expect(resourceSearchText(item)).not.toContain('raw-content-only-needle');
    expect(resourceSearchText(redacted)).toContain('redacted-preview-needle');
  });

  it('filters, sorts, and paginates generated large inventories through bounded rows', () => {
    const resources = Array.from({ length: 5_000 }, (_unused, index) => resource(index));
    const filtered = filterCapabilityResources(resources, {
      query: 'bucket-42',
      target: 'all',
      includeInternalArtifacts: false
    });
    const sorted = sortCapabilityResources(filtered, 'name', 'asc');
    const page = paginate(sorted, { page: 1, pageSize: 50 });

    expect(filtered).toHaveLength(100);
    expect(page.rows).toHaveLength(50);
    expect(page.total).toBe(100);
    expect(page.pageCount).toBe(2);
  });

  it('keeps internal cache artifacts hidden unless requested', () => {
    const resources = [
      resource(1),
      resource(2, { scope: 'plugin-bundled', metadata: { legacyScope: 'cache' } })
    ];

    expect(filterCapabilityResources(resources, { query: '', target: 'all', includeInternalArtifacts: false })).toHaveLength(1);
    expect(filterCapabilityResources(resources, { query: '', target: 'all', includeInternalArtifacts: true })).toHaveLength(2);
  });
});
