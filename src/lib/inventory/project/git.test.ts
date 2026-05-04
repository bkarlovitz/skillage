import { describe, expect, it } from 'vitest';
import { resource } from '../detectors/common';
import { createProjectContext, type GitCommandRunner } from './context';
import { classifyGitFileState, gitFileMetadata, withGitMetadata } from './git';

const context = createProjectContext({
  selectedPath: '/repo',
  repoRootPath: '/repo'
});

function stateRunner(state: 'tracked' | 'ignored' | 'untracked'): GitCommandRunner {
  return async (_cwd, args) => {
    const command = args[0];
    if (command === 'ls-files') return { exitCode: state === 'tracked' ? 0 : 1, stdout: '' };
    if (command === 'check-ignore') return { exitCode: state === 'ignored' ? 0 : 1, stdout: '' };
    return { exitCode: 1, stdout: '' };
  };
}

describe('project git metadata', () => {
  it.each([
    ['tracked' as const],
    ['ignored' as const],
    ['untracked' as const]
  ])('classifies %s project files using read-only git commands', async (state) => {
    const calls: Array<{ cwd: string; args: readonly string[] }> = [];
    const runGit: GitCommandRunner = async (cwd, args) => {
      calls.push({ cwd, args });
      return stateRunner(state)(cwd, args);
    };

    await expect(classifyGitFileState('/repo/.cursor/mcp.json', context, runGit)).resolves.toBe(state);
    expect(calls[0]).toEqual({ cwd: '/repo', args: ['ls-files', '--error-unmatch', '--', '/repo/.cursor/mcp.json'] });
    expect(calls.every((call) => call.args[0] !== 'submodule' && !call.args.includes('push'))).toBe(true);
  });

  it('classifies files outside the repo as outside-git without invoking git', async () => {
    const calls: string[] = [];
    const runGit: GitCommandRunner = async () => {
      calls.push('called');
      return { exitCode: 0, stdout: '' };
    };

    await expect(classifyGitFileState('/other/repo/.cursor/mcp.json', context, runGit)).resolves.toBe('outside-git');
    expect(calls).toEqual([]);
  });

  it('returns git-unavailable when the git command is missing', async () => {
    const runGit: GitCommandRunner = async () => {
      throw Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });
    };

    await expect(classifyGitFileState('/repo/.cursor/mcp.json', context, runGit)).resolves.toBe('git-unavailable');
  });

  it('attaches collaborator visibility metadata without changing resource identity', () => {
    const input = resource({
      id: 'cursor:config:/repo/.cursor/mcp.json',
      name: 'Cursor project MCP config',
      description: 'Project config.',
      client: 'cursor',
      resourceType: 'config-file',
      scope: 'project-shared',
      path: '/repo/.cursor/mcp.json',
      evidence: [{
        sourcePath: '/repo/.cursor/mcp.json',
        scannerRule: 'cursor-project-mcp',
        matchedPathPattern: '.cursor/mcp.json',
        readStatus: 'read',
        parseStatus: 'parsed'
      }]
    });

    const output = withGitMetadata(input, gitFileMetadata('tracked'));

    expect(output.id).toBe(input.id);
    expect(output.metadata).toMatchObject({
      gitFileState: 'tracked',
      collaboratorVisibility: 'shared'
    });
  });
});
