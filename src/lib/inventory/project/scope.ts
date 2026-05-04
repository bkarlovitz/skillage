import type { SelectedProjectContext } from '../scan';
import type { CapabilityScope } from '../types';
import { classifyProjectResourceConvention } from './conventions';

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
  return classifyProjectResourceConvention(path).scope === 'local-private';
}

export function classifyProjectPathScope(path: string, context: SelectedProjectContext): ProjectPathClassification {
  const normalizedPath = normalizeComparableProjectPath(path);
  const normalizedProjectRoot = normalizeComparableProjectPath(context.scanRootPath || context.repoRootPath || context.selectedPath || context.rootPath);
  const relativePath = relativePathFor(normalizedPath, normalizedProjectRoot);

  if (normalizedProjectRoot && isInsidePath(normalizedPath, normalizedProjectRoot)) {
    const convention = classifyProjectResourceConvention(normalizedPath);
    return {
      scope: convention.scope,
      withinProject: true,
      normalizedPath,
      normalizedProjectRoot,
      relativePath,
      reason: convention.reason
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
