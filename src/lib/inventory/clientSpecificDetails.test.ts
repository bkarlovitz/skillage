import { describe, expect, it } from 'vitest';
import { buildClientDetailModel } from './clientSummary';
import { buildClaudeCodeDetailSections, buildClaudeDesktopDetailSections } from './clientSpecificDetails';
import { detectClaudeCode } from './detectors/claudeCode';
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
