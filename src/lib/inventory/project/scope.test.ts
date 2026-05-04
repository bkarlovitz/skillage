import { describe, expect, it } from 'vitest';
import { detectCoreClients } from '../detectors';
import { createProjectContext } from './context';
import { classifyProjectPathScope, normalizeComparableProjectPath } from './scope';

describe('project scope classification', () => {
  it('keeps POSIX home repositories project-scoped while preserving globals outside the project', () => {
    const context = createProjectContext({
      selectedPath: '/home/user/repo',
      repoRootPath: '/home/user/repo'
    });

    expect(classifyProjectPathScope('/home/user/repo/.claude/settings.json', context)).toMatchObject({
      scope: 'project-shared',
      withinProject: true,
      relativePath: '.claude/settings.json'
    });
    expect(classifyProjectPathScope('/home/user/repo/.claude/settings.local.json', context)).toMatchObject({
      scope: 'local-private',
      withinProject: true
    });
    expect(classifyProjectPathScope('/home/user/.claude/settings.json', context)).toMatchObject({
      scope: 'global',
      withinProject: false
    });
  });

  it('keeps Windows home repositories project-scoped while preserving user-level globals', () => {
    const context = createProjectContext({
      selectedPath: 'C:\\Users\\user\\repo',
      repoRootPath: 'C:\\Users\\user\\repo'
    });

    expect(classifyProjectPathScope('C:\\Users\\user\\repo\\.cursor\\mcp.json', context)).toMatchObject({
      scope: 'project-shared',
      withinProject: true,
      relativePath: '.cursor/mcp.json'
    });
    expect(classifyProjectPathScope('C:\\Users\\user\\.cursor\\mcp.json', context)).toMatchObject({
      scope: 'global',
      withinProject: false
    });
  });

  it('normalizes WSL UNC project roots for identity without treating outside globals as project files', () => {
    const context = createProjectContext({
      selectedPath: '\\\\wsl.localhost\\Ubuntu\\home\\user\\repo',
      repoRootPath: '\\\\wsl.localhost\\Ubuntu\\home\\user\\repo'
    });

    expect(normalizeComparableProjectPath('\\\\wsl.localhost\\Ubuntu\\home\\user\\repo')).toBe('wsl:/ubuntu/home/user/repo');
    expect(normalizeComparableProjectPath('\\\\wsl$\\Ubuntu\\home\\user\\repo')).toBe('wsl:/ubuntu/home/user/repo');
    expect(classifyProjectPathScope('\\\\wsl$\\Ubuntu\\home\\user\\repo\\.codex\\config.toml', context)).toMatchObject({
      scope: 'project-shared',
      withinProject: true
    });
    expect(classifyProjectPathScope('\\\\wsl.localhost\\Ubuntu\\home\\user\\.codex\\config.toml', context)).toMatchObject({
      scope: 'global',
      withinProject: false
    });
  });

  it('applies project-aware scope classification in core detectors', () => {
    const context = createProjectContext({
      selectedPath: '\\\\wsl.localhost\\Ubuntu\\home\\user\\repo',
      repoRootPath: '\\\\wsl.localhost\\Ubuntu\\home\\user\\repo'
    });

    const result = detectCoreClients([
      { path: '\\\\wsl.localhost\\Ubuntu\\home\\user\\.codex\\config.toml', content: 'model = "gpt-test"' },
      { path: '\\\\wsl$\\Ubuntu\\home\\user\\repo\\.codex\\config.toml', content: 'model = "gpt-test"' }
    ], { projectContext: context });

    expect(result.resources.find((resource) => resource.path?.includes('user\\.codex'))?.scope).toBe('global');
    expect(result.resources.find((resource) => resource.path?.includes('repo\\.codex'))?.scope).toBe('project-shared');
  });
});
