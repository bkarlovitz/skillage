import type { SelectedProjectContext } from '../scan';
import type { CapabilityScope } from '../types';

const LOCAL_PRIVATE_FILENAMES = new Set([
  'claude.local.md',
  'settings.local.json'
]);

const GLOBAL_HOME_MARKERS = new Set([
  '.agents',
  '.claude',
  '.codex',
  '.cursor',
  '.hermes',
  '.openclaw'
]);

export interface ProjectPathClassification {
  scope: CapabilityScope;
  withinProject: boolean;
  normalizedPath: string;
  normalizedProjectRoot: string;
  relativePath?: string;
  reason: string;
}

export function normalizeComparableProjectPath(path: string): string {
  const slashPath = path.trim().replace(/\\/g, '/');
  const unc = slashPath.startsWith('//');
  const collapsed = slashPath.replace(/\/+/g, '/');
  const normalized = `${unc ? '/' : ''}${collapsed}`.replace(/\/+$/, '');
  return normalized
    .toLowerCase()
    .replace(/^\/\/wsl(?:\.localhost|\$)\//, 'wsl:/')
    || normalized.toLowerCase();
}

function pathParts(path: string): string[] {
  return normalizeComparableProjectPath(path).split('/').filter(Boolean);
}

function basename(path: string): string {
  return pathParts(path).pop() ?? '';
}

function isInsidePath(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function relativePathFor(path: string, root: string): string | undefined {
  if (path === root) return '';
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : undefined;
}

function isGlobalHomeResourcePath(path: string): boolean {
  if (path.startsWith('~/.')) return true;
  if (path.includes('/application support/cursor/user/') || path.includes('/.config/cursor/user/')) return true;

  const parts = path.split('/').filter(Boolean);
  const homeIndex = parts.indexOf('home');
  const usersIndex = parts.indexOf('users');
  const baseIndex = homeIndex >= 0 ? homeIndex : usersIndex;
  if (baseIndex < 0 || parts.length <= baseIndex + 2) return false;

  return GLOBAL_HOME_MARKERS.has(parts[baseIndex + 2]);
}

export function isLocalPrivateProjectPath(path: string): boolean {
  const normalized = normalizeComparableProjectPath(path);
  const fileName = basename(normalized);
  return LOCAL_PRIVATE_FILENAMES.has(fileName)
    || normalized.includes('/local/')
    || normalized.includes('/.claude/local/')
    || normalized.includes('/.codex/local/');
}

export function classifyProjectPathScope(path: string, context: SelectedProjectContext): ProjectPathClassification {
  const normalizedPath = normalizeComparableProjectPath(path);
  const normalizedProjectRoot = normalizeComparableProjectPath(context.scanRootPath || context.repoRootPath || context.selectedPath || context.rootPath);
  const relativePath = relativePathFor(normalizedPath, normalizedProjectRoot);

  if (normalizedProjectRoot && isInsidePath(normalizedPath, normalizedProjectRoot)) {
    const scope = isLocalPrivateProjectPath(normalizedPath) ? 'local-private' : 'project-shared';
    return {
      scope,
      withinProject: true,
      normalizedPath,
      normalizedProjectRoot,
      relativePath,
      reason: scope === 'local-private' ? 'project-local-convention' : 'inside-selected-project'
    };
  }

  if (isGlobalHomeResourcePath(normalizedPath)) {
    return {
      scope: 'global',
      withinProject: false,
      normalizedPath,
      normalizedProjectRoot,
      reason: 'outside-project-global-home'
    };
  }

  return {
    scope: 'unknown',
    withinProject: false,
    normalizedPath,
    normalizedProjectRoot,
    reason: 'outside-project-unknown'
  };
}
