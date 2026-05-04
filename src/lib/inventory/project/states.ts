import type { ScanSummary } from '../scan';

export type ProjectInventoryStateKind =
  | 'no-project-selected'
  | 'selected-folder-unavailable'
  | 'no-resources-found'
  | 'read-errors'
  | 'git-unavailable';

export interface ProjectInventoryState {
  kind: ProjectInventoryStateKind;
  severity: 'info' | 'warning' | 'error';
  title: string;
  detail: string;
}

export function projectInventoryStates(summary: ScanSummary, projectResourceCount: number): ProjectInventoryState[] {
  const states: ProjectInventoryState[] = [];

  if (!summary.selectedProject) {
    states.push({
      kind: 'no-project-selected',
      severity: 'info',
      title: 'No project selected',
      detail: 'Select a project folder to build a project-scoped inventory.'
    });
    return states;
  }

  const unavailableRoot = summary.scanRoots.find((root) => root.status === 'not-found' || root.status === 'read-error');
  if (unavailableRoot) {
    states.push({
      kind: 'selected-folder-unavailable',
      severity: 'error',
      title: 'Selected folder unavailable',
      detail: `${unavailableRoot.path} could not be scanned.`
    });
  }

  if (summary.readErrors.length) {
    states.push({
      kind: 'read-errors',
      severity: 'error',
      title: 'Read errors',
      detail: `${summary.readErrors.length} project path${summary.readErrors.length === 1 ? '' : 's'} could not be read.`
    });
  }

  if (summary.selectedProject.gitRootStatus === 'git-unavailable') {
    states.push({
      kind: 'git-unavailable',
      severity: 'warning',
      title: 'Git unavailable',
      detail: 'Git metadata could not be resolved, so shared/private collaborator visibility is unknown.'
    });
  }

  if (projectResourceCount === 0 && !summary.readErrors.length && !unavailableRoot) {
    states.push({
      kind: 'no-resources-found',
      severity: 'info',
      title: 'No project resources found',
      detail: 'No project-scoped, local/private, or inherited resources were found for this selection.'
    });
  }

  return states;
}
