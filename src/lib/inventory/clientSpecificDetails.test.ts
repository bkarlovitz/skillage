import { describe, expect, it } from 'vitest';
import { buildClientDetailModel } from './clientSummary';
import { buildClaudeCodeDetailSections, buildClaudeDesktopDetailSections, buildCursorDetailSections } from './clientSpecificDetails';
import { detectClaudeCode } from './detectors/claudeCode';
import { detectCursor } from './detectors/cursor';
import { getFixtureScenario } from './fixtures';
import { createEmptyScanSummary } from './scan';
import type { KnownClientLocation } from './scan';

describe('Claude Code client detail sections', () => {
  it('shows settings, skills, MCP, instructions, commands, hooks, plugins, local files, and trust caveats', () => {
    const detected = detectClaudeCode([{
      path: '/home/user/.claude/settings.json',
      content: JSON.stringify({ permissions: { allow: ['Bash(npm test)'] } })
    }, {
      path: '/repo/.claude/skills/project-review/SKILL.md',
      content: '# Project review'
    }, {
      path: '/repo/.claude/mcp.json',
      content: JSON.stringify({ mcpServers: { filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] } } })
    }, {
      path: '/repo/CLAUDE.md',
      content: '# Project instructions'
    }, {
      path: '/repo/.claude/commands/fix.md',
      content: '# Fix'
    }, {
      path: '/repo/.claude/hooks.json',
      content: JSON.stringify({ hooks: { PreToolUse: [{ command: 'echo' }] } })
    }, {
      path: '/home/user/.claude/plugins/acme/plugin.json',
      content: '{}'
    }, {
      path: '/repo/.claude/settings.local.json',
      content: JSON.stringify({ permissions: { deny: ['WebFetch'] } })
    }]);
    const detail = buildClientDetailModel(createEmptyScanSummary({
      resources: detected.resources,
      parseErrors: detected.parseErrors
    }), 'claude-code');

    const sections = buildClaudeCodeDetailSections(detail);
    const ids = sections.map((section) => section.id);
    const projectMcp = sections.find((section) => section.id === 'claude-code-project-mcp');
    const trust = sections.find((section) => section.id === 'claude-code-trust');

    expect(ids).toEqual(expect.arrayContaining([
      'claude-code-global-settings',
      'claude-code-project-settings',
      'claude-code-project-mcp',
      'claude-code-skills',
      'claude-code-instructions',
      'claude-code-commands',
      'claude-code-hooks',
      'claude-code-plugins',
      'claude-code-local-private',
      'claude-code-trust'
    ]));
    expect(projectMcp?.rows[0]).toMatchObject({
      label: 'filesystem',
      path: '/repo/.claude/mcp.json'
    });
    expect(projectMcp?.rows[0].value).toContain('mcpServers.filesystem');
    expect(trust?.rows.some((row) => row.caveat?.toLowerCase().includes('trust'))).toBe(true);
  });
});

function desktopLocation(exists: boolean): KnownClientLocation {
  return {
    client: 'claude-desktop',
    label: 'Claude Desktop config',
    path: '~/Library/Application Support/Claude/claude_desktop_config.json',
    exists,
    scope: 'global',
    resourceType: 'config-file',
    evidence: {
      sourcePath: '~/Library/Application Support/Claude/claude_desktop_config.json',
      scannerRule: 'claude-desktop-known-location',
      matchedPathPattern: 'claude_desktop_config.json',
      readStatus: exists ? 'read' : 'not-found',
      parseStatus: exists ? 'parsed' : 'not-applicable'
    }
  };
}

describe('Claude Desktop client detail sections', () => {
  it('shows exact config path, global MCP resources, logs, and restart caveat from fixtures', () => {
    const detail = buildClientDetailModel(getFixtureScenario('full-machine').summary, 'claude-desktop');
    const sections = buildClaudeDesktopDetailSections(detail);
    const config = sections.find((section) => section.id === 'claude-desktop-config-path');
    const globalMcp = sections.find((section) => section.id === 'claude-desktop-global-mcp');
    const logs = sections.find((section) => section.id === 'claude-desktop-logs');
    const restart = sections.find((section) => section.id === 'claude-desktop-restart');

    expect(config?.rows[0].path).toBe('~/Library/Application Support/Claude/claude_desktop_config.json');
    expect(globalMcp?.rows[0]).toMatchObject({ label: 'github', value: 'found' });
    expect(logs?.rows[0].value).toBe('metadata-only');
    expect(restart?.rows[0].caveat).toContain('never restarts Claude Desktop');
  });

  it('shows not-found and wrong-path state without restart action', () => {
    const detail = buildClientDetailModel(createEmptyScanSummary({
      knownClientLocations: [desktopLocation(false)]
    }), 'claude-desktop');
    const sections = buildClaudeDesktopDetailSections(detail);
    const state = sections.find((section) => section.id === 'claude-desktop-path-state');

    expect(state?.rows[0]).toMatchObject({
      value: 'not found or wrong path',
      path: '~/Library/Application Support/Claude/claude_desktop_config.json'
    });
    expect(sections.some((section) => section.id === 'claude-desktop-restart')).toBe(false);
  });
});

describe('Cursor client detail sections', () => {
  it('distinguishes global MCP, project MCP, project rules, legacy warnings, and parse mismatch warnings', () => {
    const detected = detectCursor([{
      path: '/home/user/.cursor/mcp.json',
      content: JSON.stringify({ mcpServers: { globalDocs: { command: 'node' } } })
    }, {
      path: '/repo/.cursor/mcp.json',
      content: JSON.stringify({ mcpServers: { projectDocs: { command: 'node' } } })
    }, {
      path: '/repo/.cursor/rules/svelte.mdc',
      content: '---\ndescription: Svelte\n---\n# Rule'
    }, {
      path: '/repo/.cursorrules',
      content: 'Use project conventions.'
    }, {
      path: '/broken/.cursor/mcp.json',
      content: '{not json'
    }]);
    const detail = buildClientDetailModel(createEmptyScanSummary({
      resources: detected.resources,
      parseErrors: detected.parseErrors
    }), 'cursor');
    const sections = buildCursorDetailSections(detail);

    expect(sections.find((section) => section.id === 'cursor-global-mcp')?.rows[0]).toMatchObject({
      label: 'globalDocs',
      path: '/home/user/.cursor/mcp.json'
    });
    expect(sections.find((section) => section.id === 'cursor-project-mcp')?.rows[0]).toMatchObject({
      label: 'projectDocs',
      path: '/repo/.cursor/mcp.json'
    });
    expect(sections.find((section) => section.id === 'cursor-project-rules')?.rows[0].label).toBe('Svelte');
    expect(sections.find((section) => section.id === 'cursor-legacy-rules')?.rows[0].value).toContain('Legacy .cursorrules');
    expect(sections.find((section) => section.id === 'cursor-parse-schema-warnings')?.rows[0].label).toBe('Cursor project MCP config');
  });

  it('fixture data distinguishes Cursor global MCP from project MCP and exposes malformed config warnings', () => {
    const full = buildCursorDetailSections(buildClientDetailModel(getFixtureScenario('full-machine').summary, 'cursor'));
    const partial = buildCursorDetailSections(buildClientDetailModel(getFixtureScenario('parse-read-error').summary, 'cursor'));

    expect(full.find((section) => section.id === 'cursor-global-mcp')?.rows[0].path).toBe('~/.cursor/mcp.json');
    expect(full.find((section) => section.id === 'cursor-project-mcp')?.rows[0].path).toBe('/repo/.cursor/mcp.json');
    expect(partial.find((section) => section.id === 'cursor-parse-schema-warnings')?.rows[0].value).toContain('Unexpected token');
  });
});
