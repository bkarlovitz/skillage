import { parseFrontmatter } from './frontmatter';
import type { SkillItem, SkillTarget, ValidationIssue } from './types';

export interface VirtualFile {
  path: string;
  content: string;
}

function stableId(target: SkillTarget, path: string): string {
  return `${target}:${path}`.replace(/[^a-zA-Z0-9:_./-]/g, '-');
}

function stringMeta(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.join(', ');
  return '';
}

function issue(severity: ValidationIssue['severity'], message: string): ValidationIssue {
  return { severity, message };
}

function firstHeading(markdown: string): string | undefined {
  const found = markdown.match(/^#\s+(.+)$/m);
  return found?.[1]?.trim();
}

export function parseSkillFile(file: VirtualFile): SkillItem | null {
  const path = file.path.replace(/\\/g, '/');
  const basename = path.split('/').pop() ?? path;
  const lower = path.toLowerCase();

  if (lower.includes('/.hermes/skills/') && lower.endsWith('/skill.md')) return parseClaudeStyleSkill(file, 'hermes');
  if (lower.endsWith('/skill.md') || lower === 'skill.md') return parseClaudeStyleSkill(file, 'claude-code');
  if (basename === 'CLAUDE.md') return parseInstruction(file, 'claude-code', 'Claude instructions');
  if (basename === 'AGENTS.md') return parseInstruction(file, 'codex', 'Codex instructions');
  if (lower.includes('/.cursor/rules/') && lower.endsWith('.mdc')) return parseCursorRule(file);
  if (basename === '.cursorrules') return parseInstruction(file, 'cursor', 'Legacy Cursor rules', [issue('warning', 'Legacy .cursorrules detected; prefer .cursor/rules/*.mdc')]);
  if (lower.includes('/.openclaw/') && lower.endsWith('.md')) return parseInstruction(file, 'openclaw', 'OpenClaw rule');

  return null;
}

export function parseClaudeStyleSkill(file: VirtualFile, target: SkillTarget): SkillItem {
  const parsed = parseFrontmatter(file.content);
  const name = stringMeta(parsed.attributes.name) || file.path.split('/').slice(-2, -1)[0] || 'untitled-skill';
  const description = stringMeta(parsed.attributes.description);
  const tags = Array.isArray(parsed.attributes.tags) ? parsed.attributes.tags : [];
  const issues: ValidationIssue[] = parsed.errors.map((message) => issue('error', message));

  if (!parsed.hasFrontmatter) issues.push(issue('error', 'SKILL.md should include YAML frontmatter'));
  if (!name) issues.push(issue('error', 'Skill is missing required name'));
  if (!description) issues.push(issue('warning', 'Skill is missing a description; agents use this for activation'));
  if (/\s/.test(name)) issues.push(issue('warning', 'Skill name should be filesystem-safe, preferably kebab-case'));

  return {
    id: stableId(target, file.path),
    name,
    description: description || 'No description provided',
    target,
    kind: 'skill',
    scope: file.path.startsWith('~') ? 'global' : 'project',
    path: file.path,
    entryFile: 'SKILL.md',
    body: parsed.body.trim(),
    tags,
    metadata: parsed.attributes,
    issues
  };
}

export function parseInstruction(file: VirtualFile, target: SkillTarget, fallbackName: string, extraIssues: ValidationIssue[] = []): SkillItem {
  const heading = firstHeading(file.content);
  const empty = file.content.trim().length === 0;
  const issues = [...extraIssues];
  if (empty) issues.push(issue('warning', `${file.path} is empty`));

  return {
    id: stableId(target, file.path),
    name: heading || fallbackName,
    description: `${target} ${file.path.split('/').pop()} file`,
    target,
    kind: 'instruction',
    scope: file.path.startsWith('~') ? 'global' : 'project',
    path: file.path,
    body: file.content.trim(),
    tags: [],
    metadata: {},
    issues
  };
}

export function parseCursorRule(file: VirtualFile): SkillItem {
  const parsed = parseFrontmatter(file.content);
  const issues: ValidationIssue[] = parsed.errors.map((message) => issue('error', message));
  const description = stringMeta(parsed.attributes.description);
  const globs = parsed.attributes.globs;
  const alwaysApply = parsed.attributes.alwaysApply;

  if (!parsed.hasFrontmatter) issues.push(issue('warning', 'Cursor MDC rule should include frontmatter'));
  if (!description) issues.push(issue('warning', 'Cursor rule is missing description'));
  if (globs && typeof globs !== 'string') issues.push(issue('warning', 'Cursor globs should be a comma-separated string for maximum compatibility'));
  if (alwaysApply !== undefined && typeof alwaysApply !== 'boolean') issues.push(issue('warning', 'alwaysApply should be true or false'));

  return {
    id: stableId('cursor', file.path),
    name: description || file.path.split('/').pop()?.replace(/\.mdc$/, '') || 'Cursor rule',
    description: description || 'Cursor MDC rule',
    target: 'cursor',
    kind: 'rule',
    scope: 'project',
    path: file.path,
    body: parsed.body.trim(),
    tags: [],
    metadata: parsed.attributes,
    issues
  };
}

export function parseVirtualFiles(files: VirtualFile[]): SkillItem[] {
  return files.map(parseSkillFile).filter((item): item is SkillItem => item !== null);
}
