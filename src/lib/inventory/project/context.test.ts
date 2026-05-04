import { describe, expect, it } from 'vitest';
import { resolveProjectContext, type GitCommandRunner } from './context';

function gitRunner(stdout: string, exitCode = 0): GitCommandRunner {
  return async (_cwd, _args) => ({ exitCode, stdout });
}

describe('project context resolution', () => {
  it('keeps selected folder, repo root, and scan root separate when the repo root is selected', async () => {
    const context = await resolveProjectContext({
      selectedPath: '/home/user/repo'
    }, gitRunner('/home/user/repo\n'));

    expect(context).toMatchObject({
      rootPath: '/home/user/repo',
      selectedPath: '/home/user/repo',
      repoRootPath: '/home/user/repo',
      scanRootPath: '/home/user/repo',
      displayName: 'repo',
      gitRootStatus: 'found',
      trustState: 'unknown'
    });
  });

  it('uses the detected repo root as scan root when a subdirectory is selected', async () => {
    const calls: Array<{ cwd: string; args: readonly string[] }> = [];
    const runGit: GitCommandRunner = async (cwd, args) => {
      calls.push({ cwd, args });
      return { exitCode: 0, stdout: '/home/user/repo\n' };
    };

    const context = await resolveProjectContext({
      selectedPath: '/home/user/repo/packages/app',
      displayName: 'app'
    }, runGit);

    expect(calls).toEqual([{ cwd: '/home/user/repo/packages/app', args: ['rev-parse', '--show-toplevel'] }]);
    expect(context.selectedPath).toBe('/home/user/repo/packages/app');
    expect(context.repoRootPath).toBe('/home/user/repo');
    expect(context.scanRootPath).toBe('/home/user/repo');
    expect(context.rootPath).toBe('/home/user/repo');
    expect(context.displayName).toBe('app');
  });

  it('falls back to the selected folder for non-git folders', async () => {
    const context = await resolveProjectContext({
      selectedPath: '/home/user/not-a-repo'
    }, gitRunner('', 128));

    expect(context.repoRootPath).toBeUndefined();
    expect(context.scanRootPath).toBe('/home/user/not-a-repo');
    expect(context.gitRootStatus).toBe('not-found');
  });

  it('falls back to the selected folder when git is unavailable', async () => {
    const runGit: GitCommandRunner = async () => {
      throw Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });
    };

    const context = await resolveProjectContext({
      selectedPath: '/home/user/repo'
    }, runGit);

    expect(context.repoRootPath).toBeUndefined();
    expect(context.scanRootPath).toBe('/home/user/repo');
    expect(context.gitRootStatus).toBe('git-unavailable');
  });
});
