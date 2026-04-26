import type { SkillItem } from './types';
import { parseVirtualFiles } from './adapters';

export const sampleFiles = [
  {
    path: '~/.claude/skills/code-review/SKILL.md',
    content: `---
name: code-review
description: Use when reviewing a pull request or local diff for correctness, security, and maintainability.
tags: [review, security]
---

# Code Review

Check the diff, run tests, and report critical issues first.`
  },
  {
    path: '~/uwchlan/example/AGENTS.md',
    content: `# Agent Instructions

- Run tests before changing behavior.
- Prefer small focused commits.
- Ask before destructive commands.`
  },
  {
    path: '~/uwchlan/example/CLAUDE.md',
    content: `# Claude Project Memory

This repo uses strict TDD and Svelte for the frontend.`
  },
  {
    path: '~/uwchlan/example/.cursor/rules/svelte.mdc',
    content: `---
description: Enforce Svelte component conventions
globs: src/**/*.svelte
alwaysApply: false
---

- Keep components small.
- Put business logic in src/lib.`
  },
  {
    path: '~/uwchlan/example/.cursorrules',
    content: `Use TypeScript. Prefer readable code. Keep dependencies light.`
  }
];

export const sampleItems: SkillItem[] = parseVirtualFiles(sampleFiles).map((item) => ({ ...item, scope: 'sample', origin: 'sample' }));
