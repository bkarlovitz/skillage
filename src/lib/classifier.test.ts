import { describe, expect, it } from 'vitest';
import { classifyPath } from './classifier';

describe('classifyPath', () => {
  it('classifies Hermes bundled repo skills with category', () => {
    expect(classifyPath('/home/karlo/.hermes/hermes-agent/skills/research/arxiv/SKILL.md')).toMatchObject({
      target: 'hermes',
      kind: 'skill',
      scope: 'bundled',
      origin: 'bundled',
      category: 'research',
      entryFile: 'SKILL.md'
    });
  });

  it('classifies Hermes active user skills separately from bundled skills', () => {
    expect(classifyPath('/home/karlo/.hermes/skills/software-development/systematic-debugging/SKILL.md')).toMatchObject({
      target: 'hermes',
      kind: 'skill',
      scope: 'global',
      origin: 'user',
      category: 'software-development'
    });
  });

  it('classifies Codex temporary plugin skills as temporary plugin artifacts', () => {
    expect(classifyPath('/home/karlo/.codex/.tmp/plugins/plugins/build-macos-apps/skills/appkit-interop/SKILL.md')).toMatchObject({
      target: 'codex',
      kind: 'plugin-skill',
      scope: 'temporary',
      origin: 'temporary',
      container: 'build-macos-apps'
    });
  });

  it('classifies Codex-authored user skills under .agents on Linux and Windows home paths', () => {
    expect(classifyPath('/home/karlo/.agents/skills/agents-sdk/SKILL.md')).toMatchObject({
      target: 'codex',
      kind: 'skill',
      scope: 'global',
      origin: 'user'
    });
    expect(classifyPath('C:/Users/karlo/.agents/skills/agents-sdk/SKILL.md')).toMatchObject({
      target: 'codex',
      kind: 'skill',
      scope: 'global',
      origin: 'user'
    });
  });

  it('classifies Claude Code cached plugin skills', () => {
    expect(classifyPath('/home/karlo/.claude/plugins/cache/claude-plugins-official/frontend-design/unknown/skills/frontend-design/SKILL.md')).toMatchObject({
      target: 'claude-code',
      kind: 'plugin-skill',
      scope: 'cache',
      origin: 'cache',
      container: 'frontend-design'
    });
  });

  it('classifies Claude Code global rules inside skill packages', () => {
    expect(classifyPath('/home/karlo/.claude/skills/shadcn/rules/forms.md')).toMatchObject({
      target: 'claude-code',
      kind: 'rule',
      scope: 'global',
      origin: 'user',
      category: 'shadcn'
    });
  });

  it('classifies project Cursor MDC and Markdown rules', () => {
    expect(classifyPath('/repo/.cursor/rules/svelte.mdc')).toMatchObject({
      target: 'cursor',
      kind: 'rule',
      scope: 'project',
      origin: 'project'
    });
    expect(classifyPath('/repo/.cursor/rules/api-guidelines.md')).toMatchObject({
      target: 'cursor',
      kind: 'rule',
      scope: 'project',
      origin: 'project'
    });
  });

  it('classifies OpenClaw workspace instructions', () => {
    expect(classifyPath('/home/karlo/.openclaw/workspace/SOUL.md')).toMatchObject({
      target: 'openclaw',
      kind: 'instruction',
      scope: 'workspace',
      origin: 'user',
      entryFile: 'SOUL.md'
    });
  });

  it('classifies global and project AGENTS.md files with path context', () => {
    expect(classifyPath('/home/karlo/.codex/AGENTS.md')).toMatchObject({
      target: 'codex',
      kind: 'instruction',
      scope: 'global',
      origin: 'user'
    });
    expect(classifyPath('/repo/AGENTS.md')).toMatchObject({
      target: 'codex',
      kind: 'instruction',
      scope: 'project',
      origin: 'project'
    });
  });
});
