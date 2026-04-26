import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from './frontmatter';
import { parseSkillFile, parseVirtualFiles } from './adapters';

describe('parseFrontmatter', () => {
  it('parses simple YAML-like frontmatter and body', () => {
    const parsed = parseFrontmatter(`---
name: code-review
alwaysApply: false
tags: [review, security]
---
# Body`);
    expect(parsed.errors).toEqual([]);
    expect(parsed.attributes.name).toBe('code-review');
    expect(parsed.attributes.alwaysApply).toBe(false);
    expect(parsed.attributes.tags).toEqual(['review', 'security']);
    expect(parsed.body.trim()).toBe('# Body');
  });

  it('accepts closing frontmatter delimiter at EOF', () => {
    const parsed = parseFrontmatter(`---
name: eof-skill
---`);
    expect(parsed.errors).toEqual([]);
    expect(parsed.attributes.name).toBe('eof-skill');
    expect(parsed.body).toBe('');
  });

  it('reports malformed frontmatter lines', () => {
    const parsed = parseFrontmatter(`---
name code-review
---
Body`);
    expect(parsed.errors[0]).toContain('Invalid frontmatter line');
  });
});

describe('skill adapters', () => {
  it('parses Claude/Hermes-style SKILL.md files', () => {
    const item = parseSkillFile({
      path: '~/.claude/skills/code-review/SKILL.md',
      content: `---
name: code-review
description: Review code changes
---
Instructions`
    });
    expect(item?.target).toBe('claude-code');
    expect(item?.kind).toBe('skill');
    expect(item?.name).toBe('code-review');
    expect(item?.issues).toHaveLength(0);
  });

  it('parses Hermes SKILL.md files before generic Claude-style detection', () => {
    const item = parseSkillFile({
      path: '/home/karlo/.hermes/skills/debugging/SKILL.md',
      content: `---
name: debugging
description: Debug failures systematically
---
Instructions`
    });
    expect(item?.target).toBe('hermes');
    expect(item?.kind).toBe('skill');
    expect(item?.scope).toBe('global');
    expect(item?.origin).toBe('user');
  });

  it('does not misclassify Hermes bundled skills or Codex temporary plugin skills as Claude project skills', () => {
    const hermes = parseSkillFile({
      path: '/home/karlo/.hermes/hermes-agent/skills/research/arxiv/SKILL.md',
      content: `---
name: arxiv
description: Search arXiv papers
---
Instructions`
    });
    const codex = parseSkillFile({
      path: '/home/karlo/.codex/.tmp/plugins/plugins/build-macos-apps/skills/appkit-interop/SKILL.md',
      content: `---
name: appkit-interop
description: Build AppKit integrations
---
Instructions`
    });

    expect(hermes).toMatchObject({ target: 'hermes', kind: 'skill', scope: 'bundled', origin: 'bundled', category: 'research' });
    expect(codex).toMatchObject({ target: 'codex', kind: 'plugin-skill', scope: 'temporary', origin: 'temporary', container: 'build-macos-apps' });
  });

  it('parses Claude CLAUDE.md instructions', () => {
    const item = parseSkillFile({ path: '/repo/CLAUDE.md', content: `# Claude Memory
Use pnpm.` });
    expect(item?.target).toBe('claude-code');
    expect(item?.name).toBe('Claude Memory');
    expect(item?.kind).toBe('instruction');
  });

  it('parses OpenClaw markdown placeholders conservatively', () => {
    const item = parseSkillFile({ path: '/repo/.openclaw/rules.md', content: `# OpenClaw Rules
Keep it local.` });
    expect(item?.target).toBe('openclaw');
    expect(item?.kind).toBe('instruction');
  });

  it('parses Codex AGENTS.md instructions', () => {
    const item = parseSkillFile({ path: '/repo/AGENTS.md', content: `# Repo Agents
Run npm test.` });
    expect(item?.target).toBe('codex');
    expect(item?.name).toBe('Repo Agents');
    expect(item?.kind).toBe('instruction');
  });

  it('parses Cursor MDC rules and validates frontmatter', () => {
    const item = parseSkillFile({
      path: '/repo/.cursor/rules/tests.mdc',
      content: `---
description: Test rules
globs: src/**/*.ts
alwaysApply: true
---
Use Vitest.`
    });
    expect(item?.target).toBe('cursor');
    expect(item?.kind).toBe('rule');
    expect(item?.issues).toEqual([]);
  });

  it('warns about legacy .cursorrules', () => {
    const item = parseSkillFile({ path: '/repo/.cursorrules', content: 'Use TypeScript.' });
    expect(item?.issues.some((issue) => issue.message.includes('Legacy'))).toBe(true);
  });

  it('ignores unrelated files', () => {
    expect(parseVirtualFiles([{ path: '/repo/README.md', content: '# Hello' }])).toEqual([]);
  });
});
