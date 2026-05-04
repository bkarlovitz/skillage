import type { KnownClientLocation, ScanParseError, ScannerWarning, ScanReadError, ScanSummary, SkippedSensitiveStore } from './scan';
import type { CapabilityClient, CapabilityResource, CapabilityResourceType, CapabilityStatus } from './types';

export const coreInventoryClients = ['claude-code', 'claude-desktop', 'codex', 'cursor', 'hermes', 'openclaw'] as const satisfies readonly CapabilityClient[];

export type CoreInventoryClient = typeof coreInventoryClients[number];
export type CoreClientSummaryStatus = 'installed' | 'configured' | 'partially-configured' | 'not-found';

export interface CoreClientSummary {
  client: CoreInventoryClient;
  status: CoreClientSummaryStatus;
  resourceCount: number;
  knownLocationCount: number;
  readableCount: number;
  unreadableCount: number;
  parseableCount: number;
  parseErrorCount: number;
  warningCount: number;
  profileCount: number;
  sensitiveStoreCount: number;
  logSessionStoreCount: number;
  caveats: string[];
  resources: CapabilityResource[];
}

export type ClientSummary = CoreClientSummary;

export interface ClientResourceGroup {
  resourceType: CapabilityResourceType;
  resources: CapabilityResource[];
}

export interface ClientEvidenceRow {
  resourceId: string;
  resourceName: string;
  resourceType: CapabilityResourceType;
  sourcePath?: string;
  sourceLabel?: string;
  scannerRule?: string;
  matchedPathPattern?: string;
  parsedKeyPath?: string;
  includedFromPath?: string;
  readStatus: string;
  parseStatus: string;
}

export interface ClientDetailViewModel {
  client: CoreInventoryClient;
  title: string;
  status: CoreClientSummaryStatus;
  summary: ClientSummary;
  knownLocations: KnownClientLocation[];
  resources: CapabilityResource[];
  resourceGroups: ClientResourceGroup[];
  readErrors: ScanReadError[];
  parseErrors: ScanParseError[];
  skippedSensitiveStores: SkippedSensitiveStore[];
  scannerWarnings: ScannerWarning[];
  evidenceRows: ClientEvidenceRow[];
  caveats: string[];
}

const configuredResourceTypes = new Set<CapabilityResource['resourceType']>([
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
  'workspace'
]);

function statusesFor(resource: CapabilityResource): CapabilityStatus[] {
  return resource.statuses ?? [resource.status];
}

function hasProblemStatus(resource: CapabilityResource): boolean {
  const statuses = statusesFor(resource);
  return statuses.includes('parse-error') || statuses.includes('read-error');
}

function isConfiguredResource(resource: CapabilityResource): boolean {
  return configuredResourceTypes.has(resource.resourceType)
    && resource.status !== 'not-found'
    && resource.status !== 'parse-error'
    && resource.status !== 'read-error';
}

function topCaveats(summary: ScanSummary, client: CoreInventoryClient, resources: CapabilityResource[]): string[] {
  const caveats = [
    ...resources.flatMap((resource) => resource.warnings.map((warning) => warning.message)),
    ...summary.readErrors.filter((error) => error.client === client).map((error) => error.message),
    ...summary.parseErrors.filter((error) => error.client === client).map((error) => error.message),
    ...summary.skippedSensitiveStores.filter((store) => store.client === client).map((store) => store.reason),
    ...summary.warnings.filter((warning) => warning.client === client).map((warning) => warning.message)
  ];

  return Array.from(new Set(caveats)).slice(0, 3);
}

function evidenceCounts(resources: CapabilityResource[]) {
  const evidence = resources.flatMap((resource) => resource.evidence);
  return {
    readableCount: evidence.filter((item) => item.readStatus === 'read').length,
    unreadableCount: evidence.filter((item) => item.readStatus === 'unreadable').length,
    parseableCount: evidence.filter((item) => item.parseStatus === 'parsed' || item.parseStatus === 'partially-parsed').length,
    parseErrorCount: evidence.filter((item) => item.parseStatus === 'parse-error').length
  };
}

function summaryStatus(summary: ScanSummary, client: CoreInventoryClient, resources: CapabilityResource[]): CoreClientSummaryStatus {
  const locations = summary.knownClientLocations.filter((location) => location.client === client);
  const hasLocation = locations.some((location) => location.exists);
  const hasReadOrParseProblem = summary.readErrors.some((error) => error.client === client)
    || summary.parseErrors.some((error) => error.client === client)
    || resources.some(hasProblemStatus);
  const hasConfigured = resources.some(isConfiguredResource);
  const hasAnyFoundResource = resources.some((resource) => resource.status !== 'not-found');

  if (hasReadOrParseProblem) return 'partially-configured';
  if (hasConfigured) return 'configured';
  if (hasLocation || hasAnyFoundResource) return 'installed';
  return 'not-found';
}

export function summarizeCoreClients(summary: ScanSummary): CoreClientSummary[] {
  return coreInventoryClients.map((client) => {
    const resources = summary.resources.filter((resource) => resource.client === client);
    const locations = summary.knownClientLocations.filter((location) => location.client === client);
    const warningCount = resources.reduce((total, resource) => total + resource.warnings.length, 0)
      + summary.warnings.filter((warning) => warning.client === client).length
      + summary.readErrors.filter((error) => error.client === client).length
      + summary.parseErrors.filter((error) => error.client === client).length
      + summary.skippedSensitiveStores.filter((store) => store.client === client).length;
    const counts = evidenceCounts(resources);

    return {
      client,
      status: summaryStatus(summary, client, resources),
      resourceCount: resources.length,
      knownLocationCount: locations.length,
      warningCount,
      profileCount: resources.filter((resource) => resource.resourceType === 'profile').length,
      sensitiveStoreCount: resources.filter((resource) => resource.resourceType === 'sensitive-store').length
        + summary.skippedSensitiveStores.filter((store) => store.client === client && store.resourceType === 'sensitive-store').length,
      logSessionStoreCount: resources.filter((resource) => resource.resourceType === 'log-session-store').length
        + summary.skippedSensitiveStores.filter((store) => store.client === client && store.resourceType === 'log-session-store').length,
      caveats: topCaveats(summary, client, resources),
      resources,
      ...counts
    };
  });
}

export function buildClientDetailModel(summary: ScanSummary, client: CoreInventoryClient): ClientDetailViewModel {
  const clientSummary = summarizeCoreClients(summary).find((item) => item.client === client);
  if (!clientSummary) throw new Error(`Unsupported client: ${client}`);

  const resources = clientSummary.resources;
  const resourceGroups = Object.values(resources.reduce<Record<string, ClientResourceGroup>>((groups, item) => {
    const group = groups[item.resourceType] ?? { resourceType: item.resourceType, resources: [] };
    group.resources.push(item);
    groups[item.resourceType] = group;
    return groups;
  }, {})).sort((left, right) => left.resourceType.localeCompare(right.resourceType));
  const evidenceRows = resources.flatMap((resource) => resource.evidence.map((item): ClientEvidenceRow => ({
    resourceId: resource.id,
    resourceName: resource.name,
    resourceType: resource.resourceType,
    sourcePath: item.sourcePath,
    sourceLabel: item.sourceLabel,
    scannerRule: item.scannerRule,
    matchedPathPattern: item.matchedPathPattern,
    parsedKeyPath: item.parsedKeyPath,
    includedFromPath: item.includedFromPath,
    readStatus: item.readStatus,
    parseStatus: item.parseStatus
  })));

  return {
    client,
    title: client,
    status: clientSummary.status,
    summary: clientSummary,
    knownLocations: summary.knownClientLocations.filter((location) => location.client === client),
    resources,
    resourceGroups,
    readErrors: summary.readErrors.filter((error) => error.client === client),
    parseErrors: summary.parseErrors.filter((error) => error.client === client),
    skippedSensitiveStores: summary.skippedSensitiveStores.filter((store) => store.client === client),
    scannerWarnings: summary.warnings.filter((warning) => warning.client === client),
    evidenceRows,
    caveats: clientSummary.caveats
  };
}

export function buildClientDetailModels(summary: ScanSummary): ClientDetailViewModel[] {
  return coreInventoryClients.map((client) => buildClientDetailModel(summary, client));
}
