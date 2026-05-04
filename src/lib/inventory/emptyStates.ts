import type { ScanSummary } from './scan';

export interface EmptyInventoryState {
  title: string;
  detail: string;
}

export function machineInventoryEmptyState(summary: ScanSummary): EmptyInventoryState | undefined {
  if (summary.dataSource !== 'local-scan') return undefined;
  if (summary.resources.length > 0) return undefined;
  return {
    title: 'No local capability resources found.',
    detail: 'The scan stayed empty. Use the fixture selector for demo data or scan another root.'
  };
}
