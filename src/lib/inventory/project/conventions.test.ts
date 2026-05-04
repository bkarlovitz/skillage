import { describe, expect, it } from 'vitest';
import { classifyProjectResourceConvention } from './conventions';
import { createProjectContext } from './context';
import { classifyProjectPathScope } from './scope';

describe('project resource conventions', () => {
  it('detects local/private project files for known ecosystem conventions', () => {
    expect(classifyProjectResourceConvention('/repo/.claude/settings.local.json')).toMatchObject({
      scope: 'local-private',
      convention: 'local-private'
    });
    expect(classifyProjectResourceConvention('/repo/CLAUDE.local.md')).toMatchObject({
      scope: 'local-private',
      convention: 'local-private'
    });
    expect(classifyProjectResourceConvention('/repo/.codex/local/config.toml')).toMatchObject({
      scope: 'local-private',
      convention: 'local-private'
    });
  });

  it('keeps known shared project resources separate from local/private resources', () => {
    expect(classifyProjectResourceConvention('/repo/.cursor/mcp.json')).toMatchObject({
      scope: 'project-shared',
      convention: 'project-shared'
    });
    expect(classifyProjectResourceConvention('/repo/.agents/skills/review/SKILL.md')).toMatchObject({
      scope: 'project-shared',
      convention: 'project-shared'
    });
  });

  it('returns unknown for project files without a clear sharing convention', () => {
    const context = createProjectContext({
      selectedPath: '/repo',
      repoRootPath: '/repo'
    });

    expect(classifyProjectResourceConvention('/repo/.some-client/state.json')).toMatchObject({
      scope: 'unknown',
      convention: 'unknown'
    });
    expect(classifyProjectPathScope('/repo/.some-client/state.json', context)).toMatchObject({
      scope: 'unknown',
      withinProject: true,
      reason: 'unknown-project-resource-convention'
    });
  });
});
