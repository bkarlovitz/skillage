import { defaultPreviewPolicy } from '../preview';
import type { ConfigParseError } from '../config/json';
import type {
  ScanParseError,
  ScanReadError,
  ScannerWarning,
  SelectedProjectContext,
  SkippedSensitiveStore
} from '../scan';
import type {
  CapabilityClient,
  CapabilityContentPreview,
  CapabilityEvidence,
  CapabilityResource,
  CapabilityResourceType,
  CapabilityScope,
  CapabilityStatus,
  CapabilityWarning
} from '../types';

export interface DetectorFile {
  path: string;
  content?: string;
  sizeBytes?: number;
}

export interface DetectorResult {
  resources: CapabilityResource[];
  readErrors: ScanReadError[];
  parseErrors: ScanParseError[];
  skippedSensitiveStores: SkippedSensitiveStore[];
  warnings: ScannerWarning[];
}

export interface DetectorOptions {
  projectContext?: SelectedProjectContext;
}

export interface ResourceInput {
  id: string;
  name: string;
  description: string;
  client: CapabilityClient;
  resourceType: CapabilityResourceType;
  scope: CapabilityScope;
  status?: CapabilityStatus;
  statuses?: CapabilityStatus[];
  path?: string;
  evidence: CapabilityEvidence[];
  warnings?: CapabilityWarning[];
  tags?: string[];
  metadata?: CapabilityResource['metadata'];
  contentPreview?: CapabilityContentPreview;
}

export function emptyDetectorResult(): DetectorResult {
  return {
    resources: [],
    readErrors: [],
    parseErrors: [],
    skippedSensitiveStores: [],
    warnings: []
  };
}

export function mergeDetectorResults(results: DetectorResult[]): DetectorResult {
  return results.reduce<DetectorResult>((merged, result) => ({
    resources: [...merged.resources, ...result.resources],
    readErrors: [...merged.readErrors, ...result.readErrors],
    parseErrors: [...merged.parseErrors, ...result.parseErrors],
    skippedSensitiveStores: [...merged.skippedSensitiveStores, ...result.skippedSensitiveStores],
    warnings: [...merged.warnings, ...result.warnings]
  }), emptyDetectorResult());
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function comparablePath(path: string): string {
  return normalizePath(path).toLowerCase();
}

export function basename(path: string): string {
  return normalizePath(path).split('/').pop() ?? path;
}

export function stableId(input: string): string {
  return input.replace(/[^a-zA-Z0-9:_./-]/g, '-');
}

export function evidence(input: {
  path: string;
  scannerRule: string;
  matchedPathPattern: string;
  parsedKeyPath?: string;
  readStatus?: CapabilityEvidence['readStatus'];
  parseStatus?: CapabilityEvidence['parseStatus'];
  sourceLabel?: string;
}): CapabilityEvidence {
  return {
    sourcePath: input.path,
    sourceLabel: input.sourceLabel,
    scannerRule: input.scannerRule,
    matchedPathPattern: input.matchedPathPattern,
    parsedKeyPath: input.parsedKeyPath,
    readStatus: input.readStatus ?? 'read',
    parseStatus: input.parseStatus ?? 'not-applicable'
  };
}

export function warning(kind: CapabilityWarning['kind'], severity: CapabilityWarning['severity'], message: string, warningEvidence?: CapabilityEvidence): CapabilityWarning {
  return {
    kind,
    severity,
    message,
    evidence: warningEvidence
  };
}

export function resource(input: ResourceInput): CapabilityResource {
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    client: input.client,
    resourceType: input.resourceType,
    scope: input.scope,
    status: input.status ?? 'found',
    statuses: input.statuses,
    previewPolicy: defaultPreviewPolicy({ resourceType: input.resourceType, path: input.path, name: input.name }),
    contentPreview: input.contentPreview,
    path: input.path,
    evidence: input.evidence,
    warnings: input.warnings ?? [],
    relationships: [],
    tags: input.tags ?? [],
    metadata: input.metadata ?? {}
  };
}

export function parseErrorsFromConfig(errors: ConfigParseError[]): ScanParseError[] {
  return errors.map((error) => ({
    id: error.id,
    client: error.client,
    path: error.path,
    message: error.message,
    evidence: error.evidence
  }));
}

export function fileHasAnySegment(file: DetectorFile, segments: readonly string[]): boolean {
  const normalized = comparablePath(file.path);
  return segments.some((segment) => normalized.includes(segment.toLowerCase()));
}
