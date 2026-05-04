import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseJsonConfig } from './config/json';
import { parseTomlConfig } from './config/toml';
import { extractMcpServersFromConfig } from './mcp';

describe('MCP extraction', () => {
  it('extracts JSON MCP server command, package, URL, env refs, and source evidence', () => {
    const document = parseJsonConfig({
      client: 'claude-desktop',
      path: '/home/user/.config/Claude/claude_desktop_config.json',
      content: JSON.stringify({
        mcpServers: {
          github: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' }
          }
        }
      })
    });

    const resources = extractMcpServersFromConfig({
      client: 'claude-desktop',
      scope: 'global',
      configPath: document.path,
      document
    });

    expect(resources).toHaveLength(1);
    expect(resources[0].name).toBe('github');
    expect(resources[0].status).toBe('not-tested');
    expect(resources[0].statuses).toEqual(['found', 'not-tested']);
    expect(resources[0].metadata.command).toBe('npx');
    expect(resources[0].metadata.package).toBe('@modelcontextprotocol/server-github');
    expect(resources[0].metadata.envVars).toEqual(['GITHUB_TOKEN']);
    expect(resources[0].evidence[0].sourcePath).toBe('/home/user/.config/Claude/claude_desktop_config.json');
    expect(resources[0].evidence[0].parsedKeyPath).toBe('mcpServers.github');
  });

  it('extracts TOML MCP server URL hints', () => {
    const document = parseTomlConfig({
      client: 'codex',
      path: '/home/user/.codex/config.toml',
      content: `
[mcp_servers.docs]
url = "https://example.invalid/mcp"
`
    });

    const resources = extractMcpServersFromConfig({
      client: 'codex',
      scope: 'global',
      configPath: document.path,
      document
    });

    expect(resources).toHaveLength(1);
    expect(resources[0].metadata.url).toBe('https://example.invalid/mcp');
    expect(resources[0].metadata.launchKind).toBe('remote-url');
    expect(resources[0].warnings[0].message).toContain('not started');
  });

  it('does not extract nested server resources from malformed configs', () => {
    const document = parseJsonConfig({
      client: 'cursor',
      path: '/repo/.cursor/mcp.json',
      content: '{ invalid'
    });

    const resources = extractMcpServersFromConfig({
      client: 'cursor',
      scope: 'project-shared',
      configPath: document.path,
      document
    });

    expect(document.parseErrors).toHaveLength(1);
    expect(resources).toEqual([]);
  });

  it('never executes configured MCP commands during extraction', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skillage-mcp-extract-'));
    const marker = path.join(root, 'executed');
    const document = parseJsonConfig({
      client: 'claude-code',
      path: '/repo/.claude/mcp.json',
      content: JSON.stringify({
        mcpServers: {
          dangerous: {
            command: 'node',
            args: ['-e', `require("fs").writeFileSync(${JSON.stringify(marker)}, "ran")`]
          }
        }
      })
    });

    try {
      const resources = extractMcpServersFromConfig({
        client: 'claude-code',
        scope: 'project-shared',
        configPath: document.path,
        document,
        trustGated: true
      });

      expect(resources).toHaveLength(1);
      expect(resources[0].status).toBe('needs-review');
      expect(resources[0].statuses).toEqual(['found', 'not-tested', 'needs-review']);
      expect(fs.existsSync(marker)).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
