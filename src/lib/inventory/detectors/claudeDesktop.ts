import { parseJsonConfig } from '../config/json';
import { extractMcpServersFromConfig } from '../mcp';
import type { DetectorFile, DetectorResult } from './common';
import {
  basename,
  comparablePath,
  emptyDetectorResult,
  evidence,
  parseErrorsFromConfig,
  resource,
  stableId,
  warning
} from './common';

const client = 'claude-desktop' as const;
const restartCaveat = 'Claude Desktop may require an app restart before MCP config changes are active.';

function isClaudeDesktopConfig(file: DetectorFile): boolean {
  const normalized = comparablePath(file.path);
  return basename(file.path) === 'claude_desktop_config.json'
    && (normalized.includes('/claude/') || normalized.includes('/application support/claude/') || normalized.includes('/.config/claude/'));
}

function isClaudeDesktopLogOrSession(file: DetectorFile): boolean {
  const normalized = comparablePath(file.path);
  return normalized.includes('/claude/')
    && (normalized.includes('/logs/') || normalized.includes('/sessions/') || normalized.endsWith('.log'));
}

function configResource(file: DetectorFile, parsed: ReturnType<typeof parseJsonConfig>) {
  const configEvidence = {
    ...parsed.evidence,
    scannerRule: 'claude-desktop-config',
    matchedPathPattern: 'claude_desktop_config.json'
  };

  return resource({
    id: `${client}:config:${stableId(file.path)}`,
    name: 'Claude Desktop MCP config',
    description: 'Claude Desktop global MCP configuration file.',
    client,
    resourceType: 'config-file',
    scope: 'global',
    status: parsed.parseErrors.length ? 'parse-error' : 'found',
    path: file.path,
    evidence: [configEvidence],
    warnings: [
      ...parsed.warnings,
      warning('runtime-caveat', 'info', restartCaveat, configEvidence)
    ],
    tags: ['config', 'mcp'],
    metadata: {
      exactConfigPath: file.path,
      format: 'json',
      parser: 'json-config-parser'
    },
    contentPreview: parsed.contentPreview
  });
}

function logSessionResource(file: DetectorFile) {
  const logEvidence = evidence({
    path: file.path,
    scannerRule: 'claude-desktop-log-session',
    matchedPathPattern: 'Claude logs/sessions',
    parseStatus: 'skipped'
  });

  return resource({
    id: `${client}:log-session:${stableId(file.path)}`,
    name: basename(file.path),
    description: 'Claude Desktop log or session store presence. Content is not read for inventory.',
    client,
    resourceType: 'log-session-store',
    scope: 'global',
    status: 'sensitive',
    statuses: ['found', 'sensitive'],
    path: file.path,
    evidence: [logEvidence],
    warnings: [warning('secret-auth-concern', 'info', 'Log/session contents are represented as metadata only.', logEvidence)],
    tags: ['logs', 'sessions'],
    metadata: {
      sizeBytes: file.sizeBytes ?? 0
    }
  });
}

export function detectClaudeDesktop(files: DetectorFile[]): DetectorResult {
  const result = emptyDetectorResult();
  const config = files.find(isClaudeDesktopConfig);

  if (config?.content !== undefined) {
    const parsed = parseJsonConfig({
      client,
      path: config.path,
      content: config.content,
      scannerRule: 'claude-desktop-config',
      matchedPathPattern: 'claude_desktop_config.json'
    });

    result.resources.push(configResource(config, parsed));
    result.parseErrors.push(...parseErrorsFromConfig(parsed.parseErrors));
    result.resources.push(...extractMcpServersFromConfig({
      client,
      scope: 'global',
      configPath: config.path,
      document: parsed
    }).map((mcp) => ({
      ...mcp,
      warnings: [...mcp.warnings, warning('runtime-caveat', 'info', restartCaveat, mcp.evidence[0])]
    })));
  }

  result.resources.push(...files.filter(isClaudeDesktopLogOrSession).map(logSessionResource));
  return result;
}
