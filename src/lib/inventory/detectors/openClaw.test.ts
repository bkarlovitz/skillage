import { describe, expect, it } from 'vitest';
import { detectOpenClaw } from './openClaw';

describe('OpenClaw detector', () => {
  it('detects base state and config files', () => {
    const result = detectOpenClaw([{
      path: '/home/user/.openclaw/openclaw.json',
      content: JSON.stringify({ version: 1 })
    }]);

    expect(result.resources.some((resource) => resource.resourceType === 'client-installation')).toBe(true);
    expect(result.resources.some((resource) => resource.resourceType === 'config-file')).toBe(true);
    expect(result.resources.find((resource) => resource.resourceType === 'client-installation')?.metadata.stateRoot).toBe('/home/user/.openclaw');
  });

  it('detects profile and workspace resources', () => {
    const result = detectOpenClaw([{
      path: '/home/user/.openclaw/profiles/default/config.json',
      content: '{}'
    }, {
      path: '/home/user/.openclaw/workspaces/repo/config.json',
      content: '{}'
    }]);

    expect(result.resources.find((resource) => resource.resourceType === 'profile')?.metadata.profileName).toBe('default');
    expect(result.resources.find((resource) => resource.resourceType === 'workspace')?.metadata.workspaceName).toBe('repo');
  });

  it('represents included config evidence', () => {
    const result = detectOpenClaw([{
      path: '/home/user/.openclaw/openclaw.json',
      content: JSON.stringify({ includes: ['profiles/default/config.json'] })
    }, {
      path: '/home/user/.openclaw/profiles/default/config.json',
      content: JSON.stringify({ name: 'default' })
    }]);

    const included = result.resources.find((resource) => resource.evidence.some((item) => item.includedFromPath));

    expect(included?.path).toBe('/home/user/.openclaw/profiles/default/config.json');
    expect(included?.evidence[0].includedFromPath).toBe('/home/user/.openclaw/openclaw.json');
  });

  it('surfaces missing include warnings', () => {
    const result = detectOpenClaw([{
      path: '/home/user/.openclaw/openclaw.json',
      content: JSON.stringify({ includes: ['missing.json'] })
    }]);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain('missing or unreadable');
    expect(result.warnings[0].evidence?.includedFromPath).toBe('/home/user/.openclaw/openclaw.json');
  });

  it('detects agents, skills, plugins, and migration import sources', () => {
    const result = detectOpenClaw([{
      path: '/home/user/.openclaw/agents/reviewer.json',
      content: '{}'
    }, {
      path: '/home/user/.openclaw/skills/reviewer/SKILL.md',
      content: '# Reviewer'
    }, {
      path: '/home/user/.openclaw/plugins/github/plugin.json',
      content: '{}'
    }, {
      path: '/home/user/.openclaw/imports/claude/CLAUDE.md',
      content: '# Imported'
    }]);

    expect(result.resources.some((resource) => resource.resourceType === 'custom-agent')).toBe(true);
    expect(result.resources.some((resource) => resource.resourceType === 'skill')).toBe(true);
    expect(result.resources.some((resource) => resource.resourceType === 'plugin')).toBe(true);
    expect(result.resources.some((resource) => resource.resourceType === 'migration-import-source')).toBe(true);
  });

  it('extracts MCP servers consumed by OpenClaw', () => {
    const result = detectOpenClaw([{
      path: '/home/user/.openclaw/openclaw.json',
      content: JSON.stringify({ mcpServers: { github: { command: 'npx', args: ['-y', '@mcp/github'] } } })
    }]);

    const server = result.resources.find((resource) => resource.resourceType === 'mcp-server');

    expect(server?.name).toBe('github');
    expect(server?.metadata.mcpRole).toBe('consumed');
    expect(server?.status).toBe('not-tested');
    expect(server?.relationships[0].kind).toBe('defined-by');
  });

  it('detects OpenClaw exposed as an MCP server when evidence supports it', () => {
    const result = detectOpenClaw([{
      path: '/home/user/.openclaw/openclaw.json',
      content: JSON.stringify({ exposes: { mcpServer: { url: 'http://127.0.0.1:3333/mcp' } } })
    }]);

    const server = result.resources.find((resource) => resource.resourceType === 'mcp-server');

    expect(server?.name).toBe('OpenClaw exposed MCP server');
    expect(server?.metadata.mcpRole).toBe('exposed');
    expect(server?.metadata.url).toBe('http://127.0.0.1:3333/mcp');
    expect(server?.status).toBe('not-tested');
  });

  it('marks ambiguous OpenClaw MCP config as needs-review', () => {
    const result = detectOpenClaw([{
      path: '/home/user/.openclaw/openclaw.json',
      content: JSON.stringify({ mcp: { url: 'http://127.0.0.1:3333/mcp' } })
    }]);

    const server = result.resources.find((resource) => resource.resourceType === 'mcp-server');

    expect(server?.metadata.mcpRole).toBe('unknown');
    expect(server?.status).toBe('needs-review');
    expect(server?.warnings[0].message).toContain('cannot be proven');
  });

  it('represents OpenClaw logs, sessions, credentials, traces, tokens, and memory safely', () => {
    const result = detectOpenClaw([{
      path: '/home/user/.openclaw/logs/latest.log',
      content: 'raw log body',
      sizeBytes: 12
    }, {
      path: '/home/user/.openclaw/sessions/latest.json',
      content: '{"messages":["raw session body"]}',
      sizeBytes: 33
    }, {
      path: '/home/user/.openclaw/credentials/token.json',
      content: '{"token":"raw token"}',
      sizeBytes: 21
    }, {
      path: '/home/user/.openclaw/cache/traces/run.json',
      content: '{"trace":"raw trace"}',
      sizeBytes: 21
    }, {
      path: '/home/user/.openclaw/workspaces/repo/memory.json',
      content: '{"memory":"raw memory"}',
      sizeBytes: 23
    }]);
    const serialized = JSON.stringify(result);

    expect(result.resources.filter((resource) => resource.resourceType === 'log-session-store')).toHaveLength(4);
    expect(result.resources.filter((resource) => resource.resourceType === 'sensitive-store')).toHaveLength(1);
    expect(result.resources.every((resource) => resource.contentPreview?.text === undefined)).toBe(true);
    expect(result.skippedSensitiveStores).toHaveLength(5);
    expect(serialized).not.toContain('raw log body');
    expect(serialized).not.toContain('raw session body');
    expect(serialized).not.toContain('raw token');
    expect(serialized).not.toContain('raw trace');
    expect(serialized).not.toContain('raw memory');
  });
});
