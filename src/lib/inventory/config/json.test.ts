import { describe, expect, it } from 'vitest';
import {
  getJsonObjectEntriesAtPath,
  getJsonStringAtPath,
  parseJsonConfig
} from './json';

describe('JSON config parser', () => {
  it('parses valid config with source evidence and redacted preview', () => {
    const parsed = parseJsonConfig({
      client: 'cursor',
      path: '/repo/.cursor/mcp.json',
      content: JSON.stringify({ mcpServers: { github: { command: 'npx' } } })
    });

    expect(parsed.value).toBeDefined();
    expect(parsed.parseErrors).toEqual([]);
    expect(parsed.evidence.sourcePath).toBe('/repo/.cursor/mcp.json');
    expect(parsed.evidence.parseStatus).toBe('parsed');
    expect(parsed.contentPreview.policy).toBe('redacted-preview');
    expect(parsed.contentPreview.text).toContain('"mcpServers"');
  });

  it('returns parse errors for malformed config without throwing', () => {
    const parsed = parseJsonConfig({
      client: 'claude-desktop',
      path: '/home/user/.config/Claude/claude_desktop_config.json',
      content: '{ "mcpServers": { invalid }'
    });

    expect(parsed.value).toBeUndefined();
    expect(parsed.parseErrors).toHaveLength(1);
    expect(parsed.parseErrors[0].path).toBe('/home/user/.config/Claude/claude_desktop_config.json');
    expect(parsed.parseErrors[0].evidence.parseStatus).toBe('parse-error');
    expect(parsed.evidence.readStatus).toBe('read');
  });

  it('reports nested MCP key paths for typed extraction helpers', () => {
    const parsed = parseJsonConfig({
      client: 'claude-code',
      path: '/repo/.claude/mcp.json',
      content: JSON.stringify({
        projects: {
          '/repo': {
            mcpServers: {
              filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] }
            }
          }
        }
      })
    });

    const entries = getJsonObjectEntriesAtPath(parsed, ['projects', '/repo', 'mcpServers']);
    const command = getJsonStringAtPath(parsed, ['projects', '/repo', 'mcpServers', 'filesystem', 'command']);

    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe('filesystem');
    expect(entries[0].evidence.parsedKeyPath).toBe('projects./repo.mcpServers.filesystem');
    expect(command?.value).toBe('npx');
    expect(command?.evidence.parsedKeyPath).toBe('projects./repo.mcpServers.filesystem.command');
  });

  it('redacts secret-like fields and attaches warning evidence', () => {
    const parsed = parseJsonConfig({
      client: 'cursor',
      path: '/repo/.cursor/mcp.json',
      content: JSON.stringify({
        mcpServers: {
          internal: {
            command: 'node',
            env: {
              apiKey: 'sk_live_secret_value_12345',
              password: 'plain-text-password'
            }
          }
        }
      })
    });

    expect(parsed.warnings.map((warning) => warning.kind)).toContain('secret-auth-concern');
    expect(parsed.warnings.some((warning) => warning.evidence?.parsedKeyPath === 'mcpServers.internal.env.apiKey')).toBe(true);
    expect(parsed.warnings.some((warning) => warning.evidence?.parsedKeyPath === 'mcpServers.internal.env.password')).toBe(true);
    expect(parsed.contentPreview.text).toContain('[REDACTED]');
    expect(parsed.contentPreview.text).not.toContain('sk_live_secret_value_12345');
    expect(parsed.contentPreview.text).not.toContain('plain-text-password');
  });
});
