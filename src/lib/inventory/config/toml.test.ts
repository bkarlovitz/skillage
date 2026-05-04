import { describe, expect, it } from 'vitest';
import {
  getTomlArrayAtPath,
  getTomlObjectAtPath,
  getTomlStringAtPath,
  parseTomlConfig
} from './toml';

describe('TOML config parser', () => {
  it('parses Codex-style MCP config tables', () => {
    const parsed = parseTomlConfig({
      client: 'codex',
      path: '/home/user/.codex/config.toml',
      content: `
[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
url = "https://example.invalid/mcp"

[hooks.pre_request]
command = "echo"

[agents.reviewer]
path = "~/.codex/agents/reviewer.toml"
auth_store = "~/.codex/auth.json"
`
    });

    expect(parsed.parseErrors).toEqual([]);
    expect(getTomlStringAtPath(parsed, ['mcp_servers', 'github', 'command'])?.value).toBe('npx');
    expect(getTomlArrayAtPath(parsed, ['mcp_servers', 'github', 'args'])?.value).toEqual(['-y', '@modelcontextprotocol/server-github']);
    expect(getTomlStringAtPath(parsed, ['agents', 'reviewer', 'auth_store'])?.evidence.parsedKeyPath).toBe('agents.reviewer.auth_store');
  });

  it('reports malformed TOML assignments as parse errors', () => {
    const parsed = parseTomlConfig({
      client: 'codex',
      path: '/home/user/.codex/config.toml',
      content: `
[mcp_servers.github
command =
`
    });

    expect(parsed.evidence.parseStatus).toBe('parse-error');
    expect(parsed.parseErrors).toHaveLength(2);
    expect(parsed.parseErrors[0].message).toContain('Invalid TOML table header');
    expect(parsed.contentPreview.rawPreviewAllowed).toBe(false);
  });

  it('redacts inline secret values and preserves warning key paths', () => {
    const parsed = parseTomlConfig({
      client: 'codex',
      path: '/home/user/.codex/config.toml',
      content: `
[mcp_servers.internal]
command = "node"
env = { API_TOKEN = "token-secret-value-12345", password = "plain-password" }
`
    });

    expect(parsed.warnings.some((warning) => warning.evidence?.parsedKeyPath === 'mcp_servers.internal.env.API_TOKEN')).toBe(true);
    expect(parsed.warnings.some((warning) => warning.evidence?.parsedKeyPath === 'mcp_servers.internal.env.password')).toBe(true);
    expect(parsed.contentPreview.text).toContain('[REDACTED]');
    expect(parsed.contentPreview.text).not.toContain('token-secret-value-12345');
    expect(parsed.contentPreview.text).not.toContain('plain-password');
  });

  it('keeps unknown tables parseable for later detectors', () => {
    const parsed = parseTomlConfig({
      client: 'codex',
      path: '/etc/codex/config.toml',
      content: `
[managed.experimental_feature]
enabled = true
reason = "admin managed"
`
    });

    const table = getTomlObjectAtPath(parsed, ['managed', 'experimental_feature']);

    expect(parsed.parseErrors).toEqual([]);
    expect(table?.value.enabled).toBe(true);
    expect(table?.evidence.parsedKeyPath).toBe('managed.experimental_feature');
  });
});
