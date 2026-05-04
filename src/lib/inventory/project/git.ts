import type { CapabilityResource } from '../types';
import type { GitCommandRunner } from './context';
import { normalizeComparableProjectPath } from './scope';
import type { SelectedProjectContext } from '../scan';

export type GitFileState = 'tracked' | 'ignored' | 'untracked' | 'outside-git' | 'git-unavailable';

export interface GitFileMetadata {
  state: GitFileState;
  collaboratorVisibility: 'shared' | 'private' | 'outside-git' | 'unknown';
  reason: string;
}

function isInsidePath(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

export function gitFileMetadata(state: GitFileState): GitFileMetadata {
  switch (state) {
    case 'tracked':
      return { state, collaboratorVisibility: 'shared', reason: 'git-tracked' };
    case 'ignored':
      return { state, collaboratorVisibility: 'private', reason: 'git-ignored' };
    case 'untracked':
      return { state, collaboratorVisibility: 'private', reason: 'git-untracked' };
    case 'outside-git':
      return { state, collaboratorVisibility: 'outside-git', reason: 'outside-git-worktree' };
    case 'git-unavailable':
      return { state, collaboratorVisibility: 'unknown', reason: 'git-command-unavailable' };
  }
}

export async function classifyGitFileState(path: string, context: SelectedProjectContext, runGit: GitCommandRunner): Promise<GitFileState> {
  if (context.gitRootStatus === 'git-unavailable') return 'git-unavailable';
  if (!context.repoRootPath) return 'outside-git';

  const normalizedPath = normalizeComparableProjectPath(path);
  const normalizedRepoRoot = normalizeComparableProjectPath(context.repoRootPath);
  if (!isInsidePath(normalizedPath, normalizedRepoRoot)) return 'outside-git';

  try {
    const tracked = await runGit(context.repoRootPath, ['ls-files', '--error-unmatch', '--', path]);
    if (tracked.exitCode === 0) return 'tracked';

    const ignored = await runGit(context.repoRootPath, ['check-ignore', '--quiet', '--', path]);
    if (ignored.exitCode === 0) return 'ignored';
    return 'untracked';
  } catch {
    return 'git-unavailable';
  }
}

export function withGitMetadata(resource: CapabilityResource, metadata: GitFileMetadata): CapabilityResource {
  return {
    ...resource,
    metadata: {
      ...resource.metadata,
      gitFileState: metadata.state,
      collaboratorVisibility: metadata.collaboratorVisibility,
      gitMetadataReason: metadata.reason
    }
  };
}
