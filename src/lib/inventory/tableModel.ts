import type { CapabilityClient, CapabilityResource } from './types';

export type ResourceFocus = 'all' | 'skills' | 'mcp' | 'review';

export interface ResourceFilterState {
  query: string;
  target: 'all' | CapabilityClient;
  includeInternalArtifacts: boolean;
  resourceFocus?: ResourceFocus;
}

function metadataText(metadata: CapabilityResource['metadata']): string {
  return Object.values(metadata).flatMap((value) => Array.isArray(value) ? value : [value]).join(' ');
}

function redactedPreviewText(item: CapabilityResource): string {
  return item.contentPreview?.policy === 'redacted-preview' ? item.contentPreview.text ?? '' : '';
}

export function resourceSearchText(item: CapabilityResource): string {
  const warningText = item.warnings.map((warning) => warning.message).join(' ');
  const evidenceText = item.evidence.map((itemEvidence) => `${itemEvidence.sourcePath ?? ''} ${itemEvidence.sourceLabel ?? ''} ${itemEvidence.scannerRule ?? ''} ${itemEvidence.parsedKeyPath ?? ''}`).join(' ');

  return [
    item.name,
    item.description,
    item.path ?? '',
    item.client,
    item.resourceType,
    item.scope,
    item.status,
    item.statuses?.join(' ') ?? '',
    item.tags.join(' '),
    warningText,
    evidenceText,
    metadataText(item.metadata),
    redactedPreviewText(item)
  ].join(' ').toLowerCase();
}

export function isInternalArtifact(item: CapabilityResource): boolean {
  return item.scope === 'plugin-bundled'
    && (item.metadata.legacyScope === 'cache' || item.metadata.legacyScope === 'temporary');
}

function matchesResourceFocus(item: CapabilityResource, focus: ResourceFocus = 'all'): boolean {
  switch (focus) {
    case 'skills':
      return item.resourceType === 'skill';
    case 'mcp':
      return item.resourceType === 'mcp-server';
    case 'review':
      return item.warnings.length > 0 || item.status === 'needs-review' || item.statuses?.includes('needs-review') === true;
    case 'all':
      return true;
  }
}

export function filterCapabilityResources(items: CapabilityResource[], state: ResourceFilterState): CapabilityResource[] {
  const query = state.query.toLowerCase();

  return items.filter((item) => (state.target === 'all' || item.client === state.target)
    && matchesResourceFocus(item, state.resourceFocus)
    && (state.includeInternalArtifacts || !isInternalArtifact(item))
    && resourceSearchText(item).includes(query));
}
