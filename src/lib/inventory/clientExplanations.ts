import type { ClientDetailViewModel } from './clientSummary';
import type { CapabilityClient, CapabilityEvidence, CapabilityResource, CapabilityWarningSeverity } from './types';

export type ClientExplanationKind =
  | 'restart-required'
  | 'profile-world'
  | 'trust-gate'
  | 'managed-admin'
  | 'local-private'
  | 'gateway-mode'
  | 'schema-mismatch';

export interface ClientSpecificExplanation {
  id: string;
  client: CapabilityClient;
  kind: ClientExplanationKind;
  title: string;
  body: string;
  caveat: string;
  severity: CapabilityWarningSeverity;
  resourceId?: string;
  sourcePath?: string;
  evidence?: CapabilityEvidence;
}

function stableId(input: string): string {
  return input.replace(/[^a-zA-Z0-9:_./-]/g, '-');
}

function sourcePath(resource: CapabilityResource): string {
  return resource.path ?? resource.evidence[0]?.sourcePath ?? resource.evidence[0]?.sourceLabel ?? 'unknown source';
}

function stringMetadata(resource: CapabilityResource, key: string): string | undefined {
  const value = resource.metadata[key];
  return typeof value === 'string' ? value : undefined;
}

function booleanMetadata(resource: CapabilityResource, key: string): boolean {
  return resource.metadata[key] === true;
}

function hasStatus(resource: CapabilityResource, status: string): boolean {
  return resource.status === status || (resource.statuses ?? []).includes(status as CapabilityResource['status']);
}

function hasTrustEvidence(resource: CapabilityResource): boolean {
  return resource.scope === 'project-shared'
    && (booleanMetadata(resource, 'trustGated')
      || hasStatus(resource, 'trust-gated')
      || hasStatus(resource, 'needs-review')
      || resource.warnings.some((warning) => warning.message.toLowerCase().includes('trust')));
}

function explanation(input: Omit<ClientSpecificExplanation, 'id'>): ClientSpecificExplanation {
  const source = input.resourceId ?? input.sourcePath ?? input.evidence?.sourcePath ?? input.evidence?.sourceLabel ?? input.kind;
  return {
    ...input,
    id: `${input.client}:${input.kind}:${stableId(source)}`
  };
}

function resourceExplanation(input: {
  kind: ClientExplanationKind;
  title: string;
  body: string;
  caveat: string;
  severity: CapabilityWarningSeverity;
  resource: CapabilityResource;
}): ClientSpecificExplanation {
  return explanation({
    client: input.resource.client,
    kind: input.kind,
    title: input.title,
    body: input.body,
    caveat: input.caveat,
    severity: input.severity,
    resourceId: input.resource.id,
    sourcePath: sourcePath(input.resource),
    evidence: input.resource.evidence[0]
  });
}

function restartExplanations(detail: ClientDetailViewModel): ClientSpecificExplanation[] {
  if (detail.client !== 'claude-desktop') return [];
  const configLocation = detail.knownLocations.find((location) => location.resourceType === 'config-file' && location.exists);
  const configResource = detail.resources.find((resource) => resource.resourceType === 'config-file');
  const mcpResource = detail.resources.find((resource) => resource.resourceType === 'mcp-server');
  const source = configResource ?? mcpResource;

  if (!configLocation && !source) return [];
  if (source) {
    return [resourceExplanation({
      kind: 'restart-required',
      title: 'Restart May Be Required',
      body: 'Claude Desktop MCP configuration is static file evidence; this inventory does not reload or restart the desktop app.',
      caveat: 'Treat config changes as pending until the client has been restarted or otherwise verified by the user.',
      severity: 'info',
      resource: source
    })];
  }

  return [explanation({
    client: detail.client,
    kind: 'restart-required',
    title: 'Restart May Be Required',
    body: 'Claude Desktop config location exists, but static inventory does not prove the app has reloaded it.',
    caveat: 'No restart action was performed by this inventory.',
    severity: 'info',
    sourcePath: configLocation?.path ?? configLocation?.evidence.sourcePath,
    evidence: configLocation?.evidence
  })];
}

function profileWorldExplanations(detail: ClientDetailViewModel): ClientSpecificExplanation[] {
  if (detail.client !== 'hermes' && detail.client !== 'openclaw') return [];
  return detail.resources
    .filter((resource) => resource.resourceType === 'profile')
    .map((resource) => resourceExplanation({
      kind: 'profile-world',
      title: 'Profile World',
      body: `${resource.client} profile '${stringMetadata(resource, 'profileName') ?? resource.name}' is shown as its own environment.`,
      caveat: 'Static inventory keeps profile resources separate and does not infer the active profile unless evidence explicitly supplies it.',
      severity: 'info',
      resource
    }));
}

function trustGateExplanations(detail: ClientDetailViewModel): ClientSpecificExplanation[] {
  if (detail.client !== 'claude-code' && detail.client !== 'codex') return [];
  return detail.resources
    .filter(hasTrustEvidence)
    .map((resource) => resourceExplanation({
      kind: 'trust-gate',
      title: 'Trust-Gated Project Resource',
      body: `${resource.name} was found in a project-shared location.`,
      caveat: 'Static inventory must not treat this resource as active without explicit client trust or approval evidence.',
      severity: 'warning',
      resource
    }));
}

function managedAdminExplanations(detail: ClientDetailViewModel): ClientSpecificExplanation[] {
  return detail.resources
    .filter((resource) => resource.scope === 'managed-admin' || booleanMetadata(resource, 'managed'))
    .map((resource) => resourceExplanation({
      kind: 'managed-admin',
      title: 'Managed/Admin Setting',
      body: `${resource.name} came from a managed or system/admin scope.`,
      caveat: 'Managed configuration can constrain behavior, but this inventory only reports the source and does not prove the runtime policy was applied.',
      severity: 'info',
      resource
    }));
}

function localPrivateExplanations(detail: ClientDetailViewModel): ClientSpecificExplanation[] {
  return detail.resources
    .filter((resource) => resource.scope === 'local-private')
    .map((resource) => resourceExplanation({
      kind: 'local-private',
      title: 'Local/Private File',
      body: `${resource.name} was found in a local/private scope.`,
      caveat: 'Local/private resources may affect this machine or workspace without being visible to collaborators.',
      severity: 'warning',
      resource
    }));
}

function gatewayModeExplanations(detail: ClientDetailViewModel): ClientSpecificExplanation[] {
  if (detail.client !== 'openclaw') return [];
  return detail.resources
    .filter((resource) => booleanMetadata(resource, 'gatewayOrRemoteMode')
      || resource.warnings.some((warning) => warning.message.toLowerCase().includes('gateway/remote')))
    .map((resource) => resourceExplanation({
      kind: 'gateway-mode',
      title: 'Gateway/Remote Mode',
      body: 'OpenClaw gateway or remote-mode evidence was found in configuration.',
      caveat: 'Local desktop inventory may not contain the complete runtime state for remote or gateway-managed execution.',
      severity: 'warning',
      resource
    }));
}

function schemaMismatchExplanations(detail: ClientDetailViewModel): ClientSpecificExplanation[] {
  if (detail.client !== 'cursor') return [];
  return detail.resources
    .filter((resource) => resource.status === 'parse-error'
      || resource.warnings.some((warning) => warning.kind === 'parse-read-problem' || warning.message.toLowerCase().includes('schema')))
    .map((resource) => resourceExplanation({
      kind: 'schema-mismatch',
      title: 'Schema Or Parse Mismatch',
      body: `${resource.name} could not be fully interpreted from static config evidence.`,
      caveat: 'Rows from this source may be partial; the inventory does not infer missing runtime behavior from malformed or mismatched schema data.',
      severity: 'warning',
      resource
    }));
}

export function buildClientSpecificExplanations(detail: ClientDetailViewModel): ClientSpecificExplanation[] {
  const explanations = [
    ...restartExplanations(detail),
    ...profileWorldExplanations(detail),
    ...trustGateExplanations(detail),
    ...managedAdminExplanations(detail),
    ...localPrivateExplanations(detail),
    ...gatewayModeExplanations(detail),
    ...schemaMismatchExplanations(detail)
  ];
  const seen = new Set<string>();

  return explanations.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
