import type {
  CapabilityClient,
  CapabilityEvidence,
  CapabilityResource,
  CapabilityResourceType,
  CapabilityScope,
  CapabilityWarningSeverity
} from './types';

export type ScanDataSource = 'local-scan' | 'fixture';

export type ScanRootStatus = 'scanned' | 'not-found' | 'read-error' | 'skipped';

export interface ScanRoot {
  path: string;
  label: string;
  status: ScanRootStatus;
  client?: CapabilityClient;
  scope?: CapabilityScope;
  evidence: CapabilityEvidence;
}

export interface KnownClientLocation {
  client: CapabilityClient;
  label: string;
  path?: string;
  exists: boolean;
  scope: CapabilityScope;
  resourceType: CapabilityResourceType;
  evidence: CapabilityEvidence;
}

export interface SelectedProjectContext {
  rootPath: string;
  displayName: string;
  activeProfile?: string;
  trustState: 'trusted' | 'untrusted' | 'unknown';
}

export interface ScanReadError {
  id: string;
  client?: CapabilityClient;
  path: string;
  message: string;
  evidence: CapabilityEvidence;
  rawContent?: never;
}

export interface ScanParseError {
  id: string;
  client?: CapabilityClient;
  path: string;
  message: string;
  evidence: CapabilityEvidence;
  rawContent?: never;
}

export interface SkippedSensitiveStore {
  id: string;
  client: CapabilityClient;
  resourceType: 'sensitive-store' | 'log-session-store';
  scope: CapabilityScope;
  path: string;
  reason: string;
  evidence: CapabilityEvidence;
  rawContent?: never;
  preview?: never;
}

export interface ScannerWarning {
  id: string;
  severity: CapabilityWarningSeverity;
  message: string;
  client?: CapabilityClient;
  evidence?: CapabilityEvidence;
}

export interface ScanSummary {
  id: string;
  generatedAt: string;
  dataSource: ScanDataSource;
  resources: CapabilityResource[];
  knownClientLocations: KnownClientLocation[];
  selectedProject?: SelectedProjectContext;
  scanRoots: ScanRoot[];
  readErrors: ScanReadError[];
  parseErrors: ScanParseError[];
  skippedSensitiveStores: SkippedSensitiveStore[];
  warnings: ScannerWarning[];
}

export function createEmptyScanSummary(overrides: Partial<ScanSummary> = {}): ScanSummary {
  return {
    id: overrides.id ?? 'scan-empty',
    generatedAt: overrides.generatedAt ?? new Date(0).toISOString(),
    dataSource: overrides.dataSource ?? 'local-scan',
    resources: overrides.resources ?? [],
    knownClientLocations: overrides.knownClientLocations ?? [],
    selectedProject: overrides.selectedProject,
    scanRoots: overrides.scanRoots ?? [],
    readErrors: overrides.readErrors ?? [],
    parseErrors: overrides.parseErrors ?? [],
    skippedSensitiveStores: overrides.skippedSensitiveStores ?? [],
    warnings: overrides.warnings ?? []
  };
}
