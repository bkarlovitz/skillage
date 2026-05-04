import { describe, expect, it } from 'vitest';
import { detectClaudeDesktop } from './claudeDesktop';

describe('Claude Desktop detector', () => {
  it('detects global MCP config and configured servers with restart caveat', () => {
    const result = detectClaudeDesktop([{
      path: '/home/user/.config/Claude/claude_desktop_config.json',
      content: JSON.stringify({ mcpServers: { github: { command: 'npx', args: ['-y', '@mcp/server-github'] } } })
    }]);

    const config = result.resources.find((resource) => resource.resourceType === 'config-file');
    const server = result.resources.find((resource) => resource.resourceType === 'mcp-server');

    expect(config?.path).toBe('/home/user/.config/Claude/claude_desktop_config.json');
    expect(config?.metadata.exactConfigPath).toBe('/home/user/.config/Claude/claude_desktop_config.json');
    expect(config?.warnings.some((warning) => warning.message.includes('restart'))).toBe(true);
    expect(server?.name).toBe('github');
    expect(server?.scope).toBe('global');
    expect(server?.status).toBe('not-tested');
  });

  it('ignores wrong or missing config paths', () => {
    const wrongPath = detectClaudeDesktop([{
      path: '/repo/claude_desktop_config.json',
      content: JSON.stringify({ mcpServers: { local: { command: 'node' } } })
    }]);
    const missing = detectClaudeDesktop([]);

    expect(wrongPath.resources).toEqual([]);
    expect(missing.resources).toEqual([]);
  });

  it('surfaces malformed MCP config as parse-error config resource', () => {
    const result = detectClaudeDesktop([{
      path: '/home/user/.config/Claude/claude_desktop_config.json',
      content: '{ invalid'
    }]);

    expect(result.parseErrors).toHaveLength(1);
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].status).toBe('parse-error');
    expect(result.resources[0].evidence[0].parseStatus).toBe('parse-error');
  });

  it('detects log/session presence as global metadata-only resources', () => {
    const result = detectClaudeDesktop([{
      path: '/home/user/.config/Claude/logs/2026-01-01.log',
      sizeBytes: 512
    }]);

    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].resourceType).toBe('log-session-store');
    expect(result.resources[0].scope).toBe('global');
    expect(result.resources[0].status).toBe('sensitive');
  });

  it('never emits project-scoped Claude Desktop resources', () => {
    const result = detectClaudeDesktop([{
      path: '/home/user/.config/Claude/claude_desktop_config.json',
      content: JSON.stringify({ mcpServers: { github: { command: 'npx' } } })
    }, {
      path: '/home/user/.config/Claude/sessions/latest.json',
      sizeBytes: 128
    }]);

    expect(result.resources).not.toEqual([]);
    expect(result.resources.every((resource) => resource.scope === 'global')).toBe(true);
  });
});
