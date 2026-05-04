import type { CapabilityScope } from '../types';

export interface ProjectResourceConvention {
  scope: CapabilityScope;
  convention: 'project-shared' | 'local-private' | 'unknown';
  reason: string;
}

const LOCAL_PRIVATE_FILENAMES = new Set([
  'claude.local.md',
  'settings.local.json'
]);

const PROJECT_SHARED_FILENAMES = new Set([
  '.cursorrules',
  'agents.md',
  'agents.override.md',
  'claude.md',
  'config.toml',
  'hooks.json',
  'mcp.json',
  'settings.json',
  'skill.md'
]);

function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? '';
}

function normalizeComparableProjectPath(path: string): string {
  const slashPath = path.trim().replace(/\\/g, '/');
  const unc = slashPath.startsWith('//');
  const collapsed = slashPath.replace(/\/+/g, '/');
  const normalized = `${unc ? '/' : ''}${collapsed}`.replace(/\/+$/, '');
  return normalized
    .toLowerCase()
    .replace(/^\/\/wsl(?:\.localhost|\$)\//, 'wsl:/')
    || normalized.toLowerCase();
}

export function classifyProjectResourceConvention(path: string): ProjectResourceConvention {
  const normalized = normalizeComparableProjectPath(path);
  const fileName = basename(normalized);

  if (LOCAL_PRIVATE_FILENAMES.has(fileName)
    || normalized.includes('/local/')
    || normalized.includes('/.claude/local/')
    || normalized.includes('/.codex/local/')) {
    return {
      scope: 'local-private',
      convention: 'local-private',
      reason: 'known-local-private-project-convention'
    };
  }

  if (PROJECT_SHARED_FILENAMES.has(fileName)
    || normalized.includes('/.cursor/rules/')
    || normalized.includes('/.claude/commands/')
    || normalized.includes('/.claude/agents/')
    || normalized.includes('/.claude/skills/')
    || normalized.includes('/.codex/agents/')
    || normalized.includes('/.codex/rules/')
    || normalized.includes('/.agents/skills/')
    || normalized.includes('/.agents/plugins/')) {
    return {
      scope: 'project-shared',
      convention: 'project-shared',
      reason: 'known-project-shared-convention'
    };
  }

  return {
    scope: 'unknown',
    convention: 'unknown',
    reason: 'unknown-project-resource-convention'
  };
}
