import { defaultPreviewPolicy } from './preview';
import type { CapabilityEvidence, CapabilityResource, ContentPreviewPolicy } from './types';

export interface SafeDetailPanelRow {
  label: string;
  value: string;
}

export interface SafeDetailPanel {
  id: string;
  title: string;
  description: string;
  policy: ContentPreviewPolicy;
  rows: SafeDetailPanelRow[];
  previewText?: string;
}

function sourcePath(resource: CapabilityResource): string {
  return resource.path ?? resource.evidence[0]?.sourcePath ?? resource.evidence[0]?.sourceLabel ?? 'unknown source';
}

function policyFor(resource: CapabilityResource): ContentPreviewPolicy {
  return resource.contentPreview?.policy
    ?? resource.previewPolicy
    ?? defaultPreviewPolicy({ resourceType: resource.resourceType, path: resource.path, name: resource.name });
}

function isMarkdownPreviewResource(resource: CapabilityResource): boolean {
  return resource.resourceType === 'instruction-file'
    || resource.resourceType === 'skill'
    || resource.resourceType === 'rule';
}

function metadataRows(resource: CapabilityResource, policy: ContentPreviewPolicy): SafeDetailPanelRow[] {
  return [
    { label: 'Preview policy', value: policy },
    { label: 'Body preview', value: isMarkdownPreviewResource(resource) && policy === 'safe-markdown-preview' ? 'safe markdown only' : 'metadata only' },
    { label: 'Source', value: sourcePath(resource) },
    { label: 'Type', value: resource.resourceType },
    { label: 'Scope', value: resource.scope },
    { label: 'Status', value: resource.status }
  ];
}

function evidenceRows(evidence: CapabilityEvidence[]): SafeDetailPanelRow[] {
  return evidence.flatMap((item, index) => [
    { label: `Evidence ${index + 1}`, value: item.sourcePath ?? item.sourceLabel ?? 'unknown source' },
    { label: `Rule ${index + 1}`, value: item.scannerRule ?? 'unknown' },
    { label: `Pattern ${index + 1}`, value: item.matchedPathPattern ?? 'unknown' },
    { label: `Read/parse ${index + 1}`, value: `${item.readStatus} / ${item.parseStatus}` },
    ...(item.parsedKeyPath ? [{ label: `Parsed key ${index + 1}`, value: item.parsedKeyPath }] : []),
    ...(item.includedFromPath ? [{ label: `Included from ${index + 1}`, value: item.includedFromPath }] : [])
  ]);
}

function safePreviewText(resource: CapabilityResource, policy: ContentPreviewPolicy): string | undefined {
  if (!isMarkdownPreviewResource(resource)) return undefined;
  if (policy !== 'safe-markdown-preview') return undefined;
  if (resource.contentPreview?.rawPreviewAllowed !== true) return undefined;
  return resource.contentPreview.text;
}

function previewDescription(resource: CapabilityResource, policy: ContentPreviewPolicy): string {
  if (safePreviewText(resource, policy)) return 'Safe markdown body captured for this resource type.';
  if (isMarkdownPreviewResource(resource)) return 'Markdown bodies are shown only when captured under the safe-markdown policy.';
  if (policy === 'unread-sensitive') return 'Sensitive source content is not read or displayed.';
  return 'Body content is withheld; use source metadata and evidence instead.';
}

export function buildSafeResourceDetailPanels(resource: CapabilityResource): SafeDetailPanel[] {
  const policy = policyFor(resource);
  const previewText = safePreviewText(resource, policy);

  return [
    {
      id: 'safe-preview',
      title: previewText ? 'Safe Markdown Preview' : 'Safe Metadata Panel',
      description: previewDescription(resource, policy),
      policy,
      rows: metadataRows(resource, policy),
      previewText
    },
    {
      id: 'source-evidence',
      title: 'Source Evidence',
      description: 'Scanner evidence used to create this resource row.',
      policy: 'metadata-only',
      rows: evidenceRows(resource.evidence)
    }
  ];
}
