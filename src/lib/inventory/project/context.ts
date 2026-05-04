import type { SelectedProjectContext } from '../scan';
import { normalizeComparableProjectPath } from './scope';

export type ProjectGitRootStatus = 'found' | 'not-found' | 'git-unavailable';

export interface GitCommandResult {
  exitCode: number;
  stdout: string;
  stderr?: string;
}

export type GitCommandRunner = (cwd: string, args: readonly string[]) => Promise<GitCommandResult>;

export interface GitRootResolution {
  repoRootPath?: string;
  gitRootStatus: ProjectGitRootStatus;
}

export interface ProjectContextInput extends Partial<GitRootResolution> {
  selectedPath: string;
  displayName?: string;
  trustState?: SelectedProjectContext['trustState'];
  activeProfile?: string;
}

export function displayNameForProjectPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.split('/').filter(Boolean).pop() ?? (normalized || 'Selected project');
}

export function createProjectContext(input: ProjectContextInput): SelectedProjectContext {
  const selectedPath = input.selectedPath.trim();
  const repoRootPath = input.repoRootPath?.trim() || undefined;
  const scanRootPath = repoRootPath ?? selectedPath;

  return {
    rootPath: scanRootPath,
    selectedPath,
    repoRootPath,
    scanRootPath,
    normalizedProjectId: normalizeComparableProjectPath(scanRootPath),
    displayName: input.displayName?.trim() || displayNameForProjectPath(selectedPath),
    activeProfile: input.activeProfile,
    trustState: input.trustState ?? 'unknown',
    gitRootStatus: input.gitRootStatus ?? (repoRootPath ? 'found' : 'not-found')
  };
}

export async function detectGitRepoRoot(selectedPath: string, runGit: GitCommandRunner): Promise<GitRootResolution> {
  try {
    const result = await runGit(selectedPath, ['rev-parse', '--show-toplevel']);
    if (result.exitCode === 0) {
      const repoRootPath = result.stdout.trim().split(/\r?\n/)[0]?.trim();
      if (repoRootPath) return { repoRootPath, gitRootStatus: 'found' };
    }
    return { gitRootStatus: 'not-found' };
  } catch {
    return { gitRootStatus: 'git-unavailable' };
  }
}

export async function resolveProjectContext(input: ProjectContextInput, runGit: GitCommandRunner): Promise<SelectedProjectContext> {
  const gitRoot = await detectGitRepoRoot(input.selectedPath, runGit);
  return createProjectContext({ ...input, ...gitRoot });
}
