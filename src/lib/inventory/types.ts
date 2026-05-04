export const capabilityClients = [
  'claude-code',
  'claude-desktop',
  'codex',
  'cursor',
  'hermes',
  'openclaw'
] as const;

export type CapabilityClient = typeof capabilityClients[number];

export const capabilityResourceTypes = [
  'client-installation',
  'config-file',
  'mcp-server',
  'skill',
  'instruction-file',
  'rule',
  'permission',
  'hook',
  'plugin',
  'custom-agent',
  'profile',
  'workspace',
  'sensitive-store',
  'log-session-store',
  'migration-import-source'
] as const;

export type CapabilityResourceType = typeof capabilityResourceTypes[number];

export const capabilityScopes = [
  'global',
  'project-shared',
  'local-private',
  'profile',
  'managed-admin',
  'plugin-bundled',
  'unknown'
] as const;

export type CapabilityScope = typeof capabilityScopes[number];

export const capabilityStatuses = [
  'found',
  'not-found',
  'active',
  'likely-active',
  'inherited',
  'disabled',
  'blocked',
  'shadowed',
  'overridden',
  'duplicate',
  'parse-error',
  'read-error',
  'sensitive',
  'needs-review',
  'not-tested',
  'unknown'
] as const;

export type CapabilityStatus = typeof capabilityStatuses[number];

export const contentPreviewPolicies = [
  'metadata-only',
  'redacted-preview',
  'safe-markdown-preview',
  'unread-sensitive'
] as const;

export type ContentPreviewPolicy = typeof contentPreviewPolicies[number];

export const capabilityWarningKinds = [
  'parse-read-problem',
  'scope-concern',
  'duplication-conflict',
  'secret-auth-concern',
  'runtime-caveat'
] as const;

export type CapabilityWarningKind = typeof capabilityWarningKinds[number];

export type CapabilityWarningSeverity = 'error' | 'warning' | 'info';

export const capabilityRelationshipKinds = [
  'defined-by',
  'included-from',
  'inherits-from',
  'overrides',
  'shadowed-by',
  'duplicates',
  'similar-to',
  'belongs-to-profile',
  'belongs-to-workspace',
  'provided-by-plugin',
  'imports-from'
] as const;

export type CapabilityRelationshipKind = typeof capabilityRelationshipKinds[number];

export type CapabilityEvidenceReadStatus = 'read' | 'unreadable' | 'skipped' | 'not-found';

export type CapabilityEvidenceParseStatus = 'parsed' | 'partially-parsed' | 'parse-error' | 'skipped' | 'not-applicable';

export interface CapabilityEvidence {
  sourcePath?: string;
  sourceLabel?: string;
  scannerRule?: string;
  matchedPathPattern?: string;
  parsedKeyPath?: string;
  includedFromPath?: string;
  readStatus: CapabilityEvidenceReadStatus;
  parseStatus: CapabilityEvidenceParseStatus;
}

export interface CapabilityWarning {
  kind: CapabilityWarningKind;
  severity: CapabilityWarningSeverity;
  message: string;
  evidence?: CapabilityEvidence;
}

export interface CapabilityRelationship {
  kind: CapabilityRelationshipKind;
  targetResourceId: string;
  note?: string;
  evidence?: CapabilityEvidence;
}

export interface CapabilityContentPreview {
  policy: ContentPreviewPolicy;
  rawPreviewAllowed: boolean;
  text?: string;
  reason?: string;
}

export interface CapabilityResource {
  id: string;
  name: string;
  description: string;
  client: CapabilityClient;
  resourceType: CapabilityResourceType;
  scope: CapabilityScope;
  status: CapabilityStatus;
  statuses?: CapabilityStatus[];
  previewPolicy?: ContentPreviewPolicy;
  contentPreview?: CapabilityContentPreview;
  path?: string;
  evidence: CapabilityEvidence[];
  warnings: CapabilityWarning[];
  relationships: CapabilityRelationship[];
  tags: string[];
  metadata: Record<string, string | number | boolean | string[]>;
}

export function isCapabilityClient(value: string): value is CapabilityClient {
  return (capabilityClients as readonly string[]).includes(value);
}

export function isCapabilityResourceType(value: string): value is CapabilityResourceType {
  return (capabilityResourceTypes as readonly string[]).includes(value);
}

export function isCapabilityScope(value: string): value is CapabilityScope {
  return (capabilityScopes as readonly string[]).includes(value);
}

export function isCapabilityStatus(value: string): value is CapabilityStatus {
  return (capabilityStatuses as readonly string[]).includes(value);
}
