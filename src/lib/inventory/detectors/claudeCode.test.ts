import { describe, expect, it } from 'vitest';
import { detectClaudeCode } from './claudeCode';

describe('Claude Code detector', () => {
  it('detects global .claude settings and skills without project trust caveats', () => {
    const result = detectClaudeCode([{
      path: '/home/user/.claude/settings.json',
      content: JSON.stringify({ permissions: { allow: ['Bash(npm test)'] } })
    }, {
      path: '/home/user/.claude/skills/reviewer/SKILL.md',
      content: '---\nname: reviewer\n---\n# Reviewer'
    }]);

    const config = result.resources.find((resource) => resource.path?.endsWith('settings.json'));
    const skill = result.resources.find((resource) => resource.resourceType === 'skill');
    const permission = result.resources.find((resource) => resource.resourceType === 'permission');

    expect(config?.scope).toBe('global');
    expect(skill?.scope).toBe('global');
    expect(skill?.status).toBe('found');
    expect(permission?.name).toBe('Claude Code permissions');
  });

  it('detects repo .claude resources as project-shared with trust caveats', () => {
    const result = detectClaudeCode([{
      path: '/repo/.claude/skills/project-review/SKILL.md',
      content: '# Project review'
    }, {
      path: '/repo/.claude/hooks.json',
      content: JSON.stringify({ hooks: { PreToolUse: [{ command: 'echo' }] } })
    }, {
      path: '/repo/.claude/commands/fix.md',
      content: '# Fix'
    }]);

    const skill = result.resources.find((resource) => resource.resourceType === 'skill');
    const hook = result.resources.find((resource) => resource.resourceType === 'hook');
    const command = result.resources.find((resource) => resource.tags.includes('command'));

    expect(skill?.scope).toBe('project-shared');
    expect(skill?.status).toBe('needs-review');
    expect(skill?.warnings[0].message).toContain('project trust');
    expect(hook?.status).toBe('needs-review');
    expect(command?.resourceType).toBe('instruction-file');
  });

  it('marks settings.local-style files as local-private', () => {
    const result = detectClaudeCode([{
      path: '/repo/.claude/settings.local.json',
      content: JSON.stringify({ permissions: { deny: ['WebFetch'] } })
    }, {
      path: '/repo/CLAUDE.local.md',
      content: '# Private notes'
    }]);

    expect(result.resources.find((resource) => resource.path?.endsWith('settings.local.json'))?.scope).toBe('local-private');
    expect(result.resources.find((resource) => resource.path?.endsWith('CLAUDE.local.md'))?.scope).toBe('local-private');
  });

  it('detects project MCP definitions as configured but trust-gated', () => {
    const result = detectClaudeCode([{
      path: '/repo/.claude/mcp.json',
      content: JSON.stringify({ mcpServers: { filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] } } })
    }]);

    const server = result.resources.find((resource) => resource.resourceType === 'mcp-server');

    expect(server?.name).toBe('filesystem');
    expect(server?.scope).toBe('project-shared');
    expect(server?.status).toBe('needs-review');
    expect(server?.statuses).toEqual(['found', 'not-tested', 'needs-review']);
    expect(server?.warnings.some((warning) => warning.message.includes('trust'))).toBe(true);
  });

  it('detects plugins and custom agents', () => {
    const result = detectClaudeCode([{
      path: '/home/user/.claude/plugins/acme/plugin.json',
      content: '{}'
    }, {
      path: '/repo/.claude/agents/reviewer.md',
      content: '# Reviewer'
    }]);

    expect(result.resources.find((resource) => resource.resourceType === 'plugin')?.scope).toBe('plugin-bundled');
    expect(result.resources.find((resource) => resource.resourceType === 'custom-agent')?.scope).toBe('project-shared');
  });
});
