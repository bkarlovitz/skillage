import { createEmptyScanSummary, type ScanSummary } from './scan';
import type { CapabilityResource } from './types';

export interface LocalScanResultInput {
  scanId: string;
  rootPath: string;
  rootLabel: string;
  scannerRule: string;
  matchedPathPattern: string;
  dataSourceLabel: string;
  resources: CapabilityResource[];
  loadedStatus: string;
  emptyStatus: string;
}

export interface LocalScanResult {
  resources: CapabilityResource[];
  selectedId: string;
  summary: ScanSummary;
  dataSourceLabel: string;
  statusText: string;
}

export function buildLocalScanResult(input: LocalScanResultInput): LocalScanResult {
  const summary = createEmptyScanSummary({
    id: input.scanId,
    generatedAt: new Date().toISOString(),
    dataSource: 'local-scan',
    resources: input.resources,
    scanRoots: [{
      path: input.rootPath,
      label: input.rootLabel,
      status: 'scanned',
      evidence: {
        sourcePath: input.rootPath,
        sourceLabel: input.rootLabel,
        scannerRule: input.scannerRule,
        matchedPathPattern: input.matchedPathPattern,
        readStatus: 'read',
        parseStatus: 'not-applicable'
      }
    }]
  });

  return {
    resources: input.resources,
    selectedId: input.resources[0]?.id ?? '',
    summary,
    dataSourceLabel: input.dataSourceLabel,
    statusText: input.resources.length ? input.loadedStatus : input.emptyStatus
  };
}
