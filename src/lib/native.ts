import { invoke } from '@tauri-apps/api/core';
import { parseVirtualFiles, type VirtualFile } from './adapters';
import { capabilityResourcesFromSkillItems } from './inventory/legacy';
import { buildLocalScanResult } from './inventory/localScan';
import { createProjectContext, displayNameForProjectPath } from './inventory/project/context';
import type { ScanSummary, SelectedProjectContext } from './inventory/scan';

export type RuntimeKind = 'tauri' | 'browser-dev' | 'browser-production';

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function runtimeKind(): RuntimeKind {
  if (isTauriRuntime()) return 'tauri';
  return import.meta.env.DEV ? 'browser-dev' : 'browser-production';
}

export function runtimeLabel(): string {
  switch (runtimeKind()) {
    case 'tauri':
      return 'Desktop mode';
    case 'browser-dev':
      return 'Browser dev mode';
    case 'browser-production':
      return 'Browser preview mode';
  }
}

export interface ProjectFolderSelection {
  selectedPath: string;
  displayName: string;
  source: 'native-command' | 'browser-dev-manual';
}

function isLegacyFileArray(payload: unknown): payload is VirtualFile[] {
  return Array.isArray(payload) && payload.every((item) => typeof item === 'object' && item !== null && 'path' in item);
}

function legacyFilesToSummary(files: VirtualFile[], kind: 'standard' | 'root', root = ''): ScanSummary {
  const resources = capabilityResourcesFromSkillItems(parseVirtualFiles(files));
  const result = buildLocalScanResult({
    scanId: kind === 'standard' ? 'local-standard-scan' : 'local-root-scan',
    rootPath: kind === 'standard' ? 'standard locations' : root,
    rootLabel: kind === 'standard' ? 'Standard local locations' : 'Selected scan root',
    scannerRule: kind === 'standard' ? 'standard-locations' : 'selected-root',
    matchedPathPattern: kind === 'standard' ? 'known client homes and current working directory' : root,
    dataSourceLabel: kind === 'standard' ? 'Local scan: standard locations' : `Local scan: ${root}`,
    resources,
    loadedStatus: '',
    emptyStatus: ''
  });
  return result.summary;
}

function normalizeScanPayload(payload: unknown, kind: 'standard' | 'root', root = ''): ScanSummary {
  if (isLegacyFileArray(payload)) return legacyFilesToSummary(payload, kind, root);
  return payload as ScanSummary;
}

async function scanViaDevServer(endpoint: string, kind: 'standard' | 'root', root = ''): Promise<ScanSummary> {
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`Dev scanner failed: ${response.status}`);
  return normalizeScanPayload(await response.json(), kind, root);
}

export async function scanRoot(root: string): Promise<ScanSummary> {
  if (isTauriRuntime()) {
    return normalizeScanPayload(await invoke<unknown>('scan_skill_files', { root }), 'root', root);
  }

  if (import.meta.env.DEV) {
    return scanViaDevServer(`/api/scan-root?root=${encodeURIComponent(root)}`, 'root', root);
  }

  throw new Error('Local scanning requires the Skillage desktop app.');
}

export async function scanStandardLocations(): Promise<ScanSummary> {
  if (isTauriRuntime()) {
    return normalizeScanPayload(await invoke<unknown>('scan_standard_skill_files'), 'standard');
  }

  if (import.meta.env.DEV) {
    return scanViaDevServer('/api/scan-standard', 'standard');
  }

  throw new Error('Standard-location scanning requires the Skillage desktop app.');
}

export async function selectProjectFolder(path: string): Promise<ProjectFolderSelection> {
  const trimmed = path.trim();
  if (!trimmed) throw new Error('Enter a project folder path first.');

  if (isTauriRuntime()) {
    return invoke<ProjectFolderSelection>('select_project_folder', { root: trimmed });
  }

  if (import.meta.env.DEV) {
    return {
      selectedPath: trimmed,
      displayName: displayNameForProjectPath(trimmed),
      source: 'browser-dev-manual'
    };
  }

  throw new Error('Project folder selection requires the Skillage desktop app.');
}

async function fetchJson(endpoint: string): Promise<unknown> {
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`Dev scanner failed: ${response.status}`);
  return response.json();
}

function normalizeProjectContext(payload: unknown): SelectedProjectContext {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Project context response was not an object.');
  }

  const context = payload as Partial<SelectedProjectContext>;
  if (typeof context.selectedPath !== 'string') {
    throw new Error('Project context response did not include a selected path.');
  }

  return createProjectContext({
    selectedPath: context.selectedPath,
    repoRootPath: typeof context.repoRootPath === 'string' ? context.repoRootPath : undefined,
    displayName: typeof context.displayName === 'string' ? context.displayName : undefined,
    activeProfile: typeof context.activeProfile === 'string' ? context.activeProfile : undefined,
    trustState: context.trustState,
    gitRootStatus: context.gitRootStatus
  });
}

export async function resolveProjectContext(path: string): Promise<SelectedProjectContext> {
  const trimmed = path.trim();
  if (!trimmed) throw new Error('Enter a project folder path first.');

  if (isTauriRuntime()) {
    return normalizeProjectContext(await invoke<unknown>('resolve_project_context', { root: trimmed }));
  }

  if (import.meta.env.DEV) {
    try {
      return normalizeProjectContext(await fetchJson(`/api/project-context?root=${encodeURIComponent(trimmed)}`));
    } catch {
      return createProjectContext({ selectedPath: trimmed });
    }
  }

  throw new Error('Project context resolution requires the Skillage desktop app.');
}
