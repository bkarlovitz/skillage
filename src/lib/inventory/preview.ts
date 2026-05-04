import { redactSensitiveText as redactTextWithWarnings } from './redaction';
import type { CapabilityResourceType, ContentPreviewPolicy } from './types';

export interface PreviewPolicyInput {
  resourceType: CapabilityResourceType;
  path?: string;
  name?: string;
}

export interface ContentPreview {
  policy: ContentPreviewPolicy;
  rawPreviewAllowed: boolean;
  text?: string;
  reason?: string;
}

function normalizedInput(input: PreviewPolicyInput): string {
  return `${input.resourceType} ${input.path ?? ''} ${input.name ?? ''}`.toLowerCase();
}

function looksLikeSecretStore(input: PreviewPolicyInput): boolean {
  const value = normalizedInput(input);
  return input.resourceType === 'sensitive-store'
    || /(^|[/. _-])(auth|credential|credentials|secret|secrets|token|tokens|keychain)([/. _-]|$)/.test(value)
    || /(^|\/)\.env(\.|$|\/)?/.test(value);
}

function looksLikeLogOrSessionStore(input: PreviewPolicyInput): boolean {
  const value = normalizedInput(input);
  return input.resourceType === 'log-session-store'
    || /(^|[/. _-])(log|logs|session|sessions|transcript|transcripts|cache|trace|traces|memory|memories)([/. _-]|$)/.test(value);
}

function looksLikeSafeMarkdown(input: PreviewPolicyInput): boolean {
  const value = (input.path ?? input.name ?? '').toLowerCase();
  return /\.(md|mdc|markdown)$/.test(value);
}

export function defaultPreviewPolicy(input: PreviewPolicyInput): ContentPreviewPolicy {
  if (looksLikeSecretStore(input)) return 'unread-sensitive';
  if (looksLikeLogOrSessionStore(input)) return 'metadata-only';
  if (looksLikeSafeMarkdown(input)) return 'safe-markdown-preview';
  return 'redacted-preview';
}

export function canShowRawContent(policy: ContentPreviewPolicy): boolean {
  return policy === 'safe-markdown-preview';
}

export function redactSensitiveText(text: string): string {
  return redactTextWithWarnings(text).text;
}

export function createContentPreview(policy: ContentPreviewPolicy, content: string, reason?: string): ContentPreview {
  if (policy === 'unread-sensitive') {
    return {
      policy,
      rawPreviewAllowed: false,
      reason: reason ?? 'Sensitive source content is not read by default.'
    };
  }

  if (policy === 'metadata-only') {
    return {
      policy,
      rawPreviewAllowed: false,
      reason: reason ?? 'Only source metadata is previewable by default.'
    };
  }

  if (policy === 'redacted-preview') {
    return {
      policy,
      rawPreviewAllowed: false,
      text: redactSensitiveText(content),
      reason
    };
  }

  return {
    policy,
    rawPreviewAllowed: true,
    text: content,
    reason
  };
}
