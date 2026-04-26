import { classifyPath, type Classification } from './classifier';
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

function fallbackNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const basename = normalized.split('/').pop() ?? normalized;
  if (basename === 'SKILL.md') return normalized.split('/').slice(-2, -1)[0] || 'untitled-skill';
  return basename.replace(/\.(md|mdc|rules|toml|json)$/i, '') || 'untitled';
}

function applyClassification(base: Omit<SkillItem, 'id' | 'target' | 'source' | 'kind' | 'scope' | 'origin' | 'category' | 'container' | 'entryFile'>, classification: Classification, path: string): SkillItem {
  return {
    id: stableId(classification.target, path),
    ...base,
    target: classification.target,
    source: classification.source,
    kind: classification.kind,
    scope: classification.scope,
    origin: classification.origin,
    category: classification.category,
    container: classification.container,
    entryFile: classification.entryFile
  };
}

export function parseSkillFile(file: VirtualFile): SkillItem | null {
  const classification = classifyPath(file.path);
  if (!classification) return null;

  if (classification.kind === 'skill' || classification.kind === 'plugin-skill') return parseSkillPackage(file, classification);
  if (classification.kind === 'rule') return parseRule(file, classification);
  if (classification.kind === 'instruction' || classification.kind === 'memory') return parseInstruction(file, classification);
  return parseConfigLike(file, classification);
}

export function parseSkillPackage(file: VirtualFile, classification: Classification): SkillItem {
  const parsed = parseFrontmatter(file.content);
  const name = stringMeta(parsed.attributes.name) || fallbackNameFromPath(file.path);
  const description = stringMeta(parsed.attributes.description);
  const tags = Array.isArray(parsed.attributes.tags) ? parsed.attributes.tags : [];
  const issues: ValidationIssue[] = parsed.errors.map((message) => issue('error', message));

  if (!parsed.hasFrontmatter) issues.push(issue('error', 'SKILL.md should include YAML frontmatter'));
  if (!name) issues.push(issue('error', 'Skill is missing required name'));
  if (!description) issues.push(issue('warning', 'Skill is missing a description; agents use this for activation'));
  if (/\s/.test(name)) issues.push(issue('warning', 'Skill name should be filesystem-safe, preferably kebab-case'));

  return applyClassification({
    name,
    description: description || 'No description provided',
    path: file.path,
    body: parsed.body.trim(),
    tags,
    metadata: parsed.attributes,
    issues
  }, classification, file.path);
}

export function parseClaudeStyleSkill(file: VirtualFile, target: SkillTarget): SkillItem {
  return parseSkillPackage(file, {
    target,
    source: target,
    kind: 'skill',
    scope: file.path.startsWith('~') ? 'global' : 'project',
    origin: file.path.startsWith('~') ? 'user' : 'project',
    entryFile: 'SKILL.md'
  });
}

export function parseInstruction(file: VirtualFile, classificationOrTarget: Classification | SkillTarget, fallbackName?: string, extraIssues: ValidationIssue[] = []): SkillItem {
  const classification: Classification = typeof classificationOrTarget === 'string'
    ? {
      target: classificationOrTarget,
      source: classificationOrTarget,
      kind: 'instruction',
      scope: file.path.startsWith('~') ? 'global' : 'project',
      origin: file.path.startsWith('~') ? 'user' : 'project',
      entryFile: file.path.split('/').pop()
    }
    : classificationOrTarget;
  const heading = firstHeading(file.content);
  const empty = file.content.trim().length === 0;
  const issues = [...extraIssues];
  if (empty) issues.push(issue('warning', `${file.path} is empty`));
  const name = heading || fallbackName || fallbackNameFromPath(file.path);

  return applyClassification({
    name,
    description: `${classification.target} ${classification.entryFile ?? file.path.split('/').pop()} file`,
    path: file.path,
    body: file.content.trim(),
    tags: [],
    metadata: {},
    issues
  }, classification, file.path);
}

export function parseRule(file: VirtualFile, classification: Classification): SkillItem {
  if (classification.target === 'cursor' && file.path.toLowerCase().endsWith('.mdc')) return parseCursorRule(file, classification);

  const parsed = parseFrontmatter(file.content);
  const heading = firstHeading(parsed.body || file.content);
  const description = stringMeta(parsed.attributes.description);
  const issues: ValidationIssue[] = parsed.errors.map((message) => issue('error', message));
  if (file.path.replace(/\\/g, '/').endsWith('/.cursorrules')) {
    issues.push(issue('warning', 'Legacy .cursorrules detected; prefer .cursor/rules/*.mdc or AGENTS.md'));
  }

  return applyClassification({
    name: heading || description || fallbackNameFromPath(file.path),
    description: description || `${classification.target} rule`,
    path: file.path,
    body: (parsed.hasFrontmatter ? parsed.body : file.content).trim(),
    tags: [],
    metadata: parsed.attributes,
    issues
  }, classification, file.path);
}

export function parseCursorRule(file: VirtualFile, classification: Classification = {
  target: 'cursor',
  source: 'cursor',
  kind: 'rule',
  scope: 'project',
  origin: 'project',
  entryFile: file.path.split('/').pop()
}): SkillItem {
  const parsed = parseFrontmatter(file.content);
  const issues: ValidationIssue[] = parsed.errors.map((message) => issue('error', message));
  const description = stringMeta(parsed.attributes.description);
  const globs = parsed.attributes.globs;
  const alwaysApply = parsed.attributes.alwaysApply;

  if (!parsed.hasFrontmatter) issues.push(issue('warning', 'Cursor MDC rule should include frontmatter'));
  if (!description) issues.push(issue('warning', 'Cursor rule is missing description'));
  if (globs && typeof globs !== 'string') issues.push(issue('warning', 'Cursor globs should be a comma-separated string for maximum compatibility'));
  if (alwaysApply !== undefined && typeof alwaysApply !== 'boolean') issues.push(issue('warning', 'alwaysApply should be true or false'));

  return applyClassification({
    name: description || fallbackNameFromPath(file.path),
    description: description || 'Cursor MDC rule',
    path: file.path,
    body: parsed.body.trim(),
    tags: [],
    metadata: parsed.attributes,
    issues
  }, classification, file.path);
}

export function parseConfigLike(file: VirtualFile, classification: Classification): SkillItem {
  return applyClassification({
    name: fallbackNameFromPath(file.path),
    description: `${classification.target} ${classification.kind}`,
    path: file.path,
    body: file.content.trim(),
    tags: [],
    metadata: {},
    issues: []
  }, classification, file.path);
}

export function parseVirtualFiles(files: VirtualFile[]): SkillItem[] {
  return files.map(parseSkillFile).filter((item): item is SkillItem => item !== null);
}
