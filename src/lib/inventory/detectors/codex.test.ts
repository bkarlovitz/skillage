import { describe, expect, it } from 'vitest';
import { detectCodex } from './codex';

describe('Codex detector', () => {
  it('detects user config, MCP servers, and auth stores', () => {
    const result = detectCodex([{
      path: '/home/user/.codex/config.toml',
      content: `
[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
`
    }, {
      path: '/home/user/.codex/auth.json',
      sizeBytes: 1024
    }]);

    const config = result.resources.find((resource) => resource.resourceType === 'config-file');
    const server = result.resources.find((resource) => resource.resourceType === 'mcp-server');
    const auth = result.resources.find((resource) => resource.resourceType === 'sensitive-store');

    expect(config?.scope).toBe('global');
    expect(server?.scope).toBe('global');
    expect(server?.status).toBe('not-tested');
    expect(auth?.status).toBe('sensitive');
    expect(auth?.previewPolicy).toBe('unread-sensitive');
  });

  it('detects /etc/codex as managed-admin config', () => {
    const result = detectCodex([{
      path: '/etc/codex/config.toml',
      content: 'managed = true'
    }]);

    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].name).toBe('Codex managed/admin config');
    expect(result.resources[0].scope).toBe('managed-admin');
    expect(result.resources[0].metadata.managed).toBe(true);
  });

  it('detects project AGENTS files without claiming active trust state', () => {
    const result = detectCodex([{
      path: '/repo/AGENTS.md',
      content: '# Instructions'
    }]);

    expect(result.resources[0].resourceType).toBe('instruction-file');
    expect(result.resources[0].scope).toBe('project-shared');
    expect(result.resources[0].status).toBe('needs-review');
    expect(result.resources[0].warnings[0].message).toContain('workspace trust');
  });

  it('distinguishes global and project .agents skill locations', () => {
    const result = detectCodex([{
      path: '/home/user/.agents/skills/reviewer/SKILL.md',
      content: '# Reviewer'
    }, {
      path: '/repo/.agents/skills/project/SKILL.md',
      content: '# Project'
    }]);

    const globalSkill = result.resources.find((resource) => resource.path?.includes('/home/user/.agents'));
    const projectSkill = result.resources.find((resource) => resource.path?.includes('/repo/.agents'));

    expect(globalSkill?.scope).toBe('global');
    expect(globalSkill?.status).toBe('found');
    expect(projectSkill?.scope).toBe('project-shared');
    expect(projectSkill?.status).toBe('needs-review');
  });

  it('marks project MCP, hooks, and custom agents as trust-gated', () => {
    const result = detectCodex([{
      path: '/repo/.codex/config.toml',
      content: `
[mcp_servers.local]
command = "node"

[hooks.pre_request]
command = "echo"

[agents.reviewer]
path = ".codex/agents/reviewer.toml"
`
    }]);

    const server = result.resources.find((resource) => resource.resourceType === 'mcp-server');
    const hook = result.resources.find((resource) => resource.resourceType === 'hook');
    const agent = result.resources.find((resource) => resource.resourceType === 'custom-agent');

    expect(server?.status).toBe('needs-review');
    expect(server?.statuses).toEqual(['found', 'not-tested', 'needs-review']);
    expect(hook?.status).toBe('needs-review');
    expect(agent?.status).toBe('needs-review');
  });

  it('detects plugin and standalone custom agent paths', () => {
    const result = detectCodex([{
      path: '/home/user/.agents/plugins/acme/plugin.json',
      content: '{}'
    }, {
      path: '/repo/.codex/agents/reviewer.toml',
      content: 'name = "reviewer"'
    }]);

    expect(result.resources.find((resource) => resource.resourceType === 'plugin')?.scope).toBe('plugin-bundled');
    expect(result.resources.find((resource) => resource.resourceType === 'custom-agent')?.scope).toBe('project-shared');
  });

  it('detects project Codex rules as trust-gated rule resources', () => {
    const result = detectCodex([{
      path: '/repo/.codex/rules/review.rules',
      content: 'prefer tests'
    }]);

    expect(result.resources[0]).toMatchObject({
      resourceType: 'rule',
      scope: 'project-shared',
      status: 'needs-review'
    });
    expect(result.resources[0].warnings[0].message).toContain('workspace trust');
  });
});
