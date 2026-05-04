import { parseFrontmatter } from '../../frontmatter';
import { parseJsonConfig } from '../config/json';
import { extractMcpServersFromConfig } from '../mcp';
import { classifyProjectPathScope } from '../project/scope';
import type { SelectedProjectContext } from '../scan';
import type { CapabilityResource, CapabilityScope, CapabilityWarning } from '../types';
import type { DetectorFile, DetectorOptions, DetectorResult } from './common';
import {
  basename,
  comparablePath,
  emptyDetectorResult,
  evidence,
  normalizePath,
  parseErrorsFromConfig,
  resource,
  stableId,
  warning
} from './common';

const client = 'cursor' as const;

function segments(path: string): string[] {
  return normalizePath(path).split('/').filter(Boolean);
}

function isHomeCursorPath(path: string): boolean {
  const normalized = normalizePath(path);
  const lower = comparablePath(path);
  if (normalized.startsWith('~/.cursor/')) return true;
  if (lower.includes('/application support/cursor/user/') || lower.includes('/.config/cursor/user/')) return true;
  const parts = segments(path).map((part) => part.toLowerCase());
  const index = parts.indexOf('.cursor');
  return (parts[0] === 'home' && index === 2) || (parts[0] === 'users' && index === 2);
}

function scopeForPath(path: string, projectContext?: SelectedProjectContext): CapabilityScope {
  if (projectContext) {
    const classification = classifyProjectPathScope(path, projectContext);
    if (classification.scope !== 'unknown') return classification.scope;
  }
  return isHomeCursorPath(path) ? 'global' : 'project-shared';
}

function isCursorFile(file: DetectorFile): boolean {
  const normalized = comparablePath(file.path);
  return normalized.includes('/.cursor/')
    || normalized.includes('/cursor/user/')
    || basename(file.path) === '.cursorrules';
}

function isMcpConfig(file: DetectorFile): boolean {
  return basename(file.path) === 'mcp.json';
}

function isMdcRule(file: DetectorFile): boolean {
  const normalized = comparablePath(file.path);
  return normalized.includes('/.cursor/rules/') && basename(file.path).endsWith('.mdc');
}

function isLegacyRule(file: DetectorFile): boolean {
  return basename(file.path) === '.cursorrules';
}

function configResource(file: DetectorFile, parsed: ReturnType<typeof parseJsonConfig>, projectContext?: SelectedProjectContext): CapabilityResource {
  const scope = scopeForPath(file.path, projectContext);
  const configEvidence = {
    ...parsed.evidence,
    scannerRule: scope === 'global' ? 'cursor-global-mcp' : 'cursor-project-mcp',
    matchedPathPattern: scope === 'global' ? 'Cursor global mcp.json' : '.cursor/mcp.json'
  };

  return resource({
    id: `${client}:config:${stableId(file.path)}`,
    name: scope === 'global' ? 'Cursor global MCP config' : 'Cursor project MCP config',
    description: `Cursor ${scope} MCP configuration file.`,
    client,
    resourceType: 'config-file',
    scope,
    status: parsed.parseErrors.length ? 'parse-error' : 'found',
    path: file.path,
    evidence: [configEvidence],
    warnings: parsed.warnings,
    tags: ['config', 'mcp'],
    metadata: {
      format: 'json',
      mcpScope: scope
    },
    contentPreview: parsed.contentPreview
  });
}

function ruleWarnings(file: DetectorFile): { warnings: CapabilityWarning[]; parseError: boolean; name: string } {
  const parsed = parseFrontmatter(file.content ?? '');
  const sourceEvidence = evidence({
    path: file.path,
    scannerRule: 'cursor-mdc-rule',
    matchedPathPattern: '.cursor/rules/*.mdc',
    parseStatus: parsed.errors.length ? 'parse-error' : 'parsed'
  });
  const warnings: CapabilityWarning[] = parsed.errors.map((message) => warning('parse-read-problem', 'error', message, sourceEvidence));
  const description = parsed.attributes.description;
  const globs = parsed.attributes.globs;
  const alwaysApply = parsed.attributes.alwaysApply;

  if (!parsed.hasFrontmatter) warnings.push(warning('parse-read-problem', 'warning', 'Cursor MDC rule should include frontmatter.', sourceEvidence));
  if (description !== undefined && typeof description !== 'string') warnings.push(warning('parse-read-problem', 'warning', 'Cursor rule description should be a string.', sourceEvidence));
  if (globs !== undefined && typeof globs !== 'string') warnings.push(warning('parse-read-problem', 'warning', 'Cursor rule globs should be a comma-separated string.', sourceEvidence));
  if (alwaysApply !== undefined && typeof alwaysApply !== 'boolean') warnings.push(warning('parse-read-problem', 'warning', 'Cursor rule alwaysApply should be true or false.', sourceEvidence));

  return {
    warnings,
    parseError: parsed.errors.length > 0,
    name: typeof description === 'string' && description.trim() ? description.trim() : basename(file.path).replace(/\.mdc$/i, '')
  };
}

function mdcRuleResource(file: DetectorFile, projectContext?: SelectedProjectContext): CapabilityResource {
  const scope = scopeForPath(file.path, projectContext);
  const sourceEvidence = evidence({
    path: file.path,
    scannerRule: 'cursor-mdc-rule',
    matchedPathPattern: '.cursor/rules/*.mdc',
    parseStatus: ruleWarnings(file).parseError ? 'parse-error' : 'parsed'
  });
  const rule = ruleWarnings(file);

  return resource({
    id: `${client}:rule:${stableId(file.path)}`,
    name: rule.name,
    description: 'Cursor project MDC rule.',
    client,
    resourceType: 'rule',
    scope,
    status: rule.parseError ? 'parse-error' : 'found',
    path: file.path,
    evidence: [sourceEvidence],
    warnings: rule.warnings,
    tags: ['rule', 'mdc'],
    metadata: {
      ruleFormat: 'mdc'
    }
  });
}

function legacyRuleResource(file: DetectorFile, projectContext?: SelectedProjectContext): CapabilityResource {
  const scope = scopeForPath(file.path, projectContext);
  const sourceEvidence = evidence({
    path: file.path,
    scannerRule: 'cursor-legacy-rule',
    matchedPathPattern: '.cursorrules'
  });

  return resource({
    id: `${client}:legacy-rule:${stableId(file.path)}`,
    name: '.cursorrules',
    description: 'Legacy Cursor rules file.',
    client,
    resourceType: 'rule',
    scope,
    status: 'needs-review',
    statuses: ['found', 'needs-review'],
    path: file.path,
    evidence: [sourceEvidence],
    warnings: [warning('runtime-caveat', 'warning', 'Legacy .cursorrules detected; prefer .cursor/rules/*.mdc.', sourceEvidence)],
    tags: ['rule', 'legacy'],
    metadata: {
      ruleFormat: 'legacy-cursorrules'
    }
  });
}

export function detectCursor(files: DetectorFile[], options: DetectorOptions = {}): DetectorResult {
  const result = emptyDetectorResult();
  const { projectContext } = options;

  for (const file of files.filter(isCursorFile)) {
    if (isMcpConfig(file) && file.content !== undefined) {
      const scope = scopeForPath(file.path, projectContext);
      const parsed = parseJsonConfig({
        client,
        path: file.path,
        content: file.content,
        scannerRule: scope === 'global' ? 'cursor-global-mcp' : 'cursor-project-mcp',
        matchedPathPattern: scope === 'global' ? 'Cursor global mcp.json' : '.cursor/mcp.json'
      });

      result.resources.push(configResource(file, parsed, projectContext));
      result.resources.push(...extractMcpServersFromConfig({
        client,
        scope,
        configPath: file.path,
        document: parsed
      }));
      result.parseErrors.push(...parseErrorsFromConfig(parsed.parseErrors));
      continue;
    }

    if (isMdcRule(file)) {
      result.resources.push(mdcRuleResource(file, projectContext));
      continue;
    }

    if (isLegacyRule(file)) {
      result.resources.push(legacyRuleResource(file, projectContext));
    }
  }

  return result;
}
