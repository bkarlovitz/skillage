import { describe, expect, it } from 'vitest';
import { buildClientDetailModel } from './clientSummary';
import { buildClaudeCodeDetailSections } from './clientSpecificDetails';
import { detectClaudeCode } from './detectors/claudeCode';
import { createEmptyScanSummary } from './scan';

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
