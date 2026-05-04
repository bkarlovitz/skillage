import { describe, expect, it } from 'vitest';
import { buildClientDetailModel } from './clientSummary';
import { buildClaudeCodeDetailSections, buildClaudeDesktopDetailSections, buildCodexDetailSections, buildCursorDetailSections } from './clientSpecificDetails';
import { detectClaudeCode } from './detectors/claudeCode';
import { detectCodex } from './detectors/codex';
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

describe('Codex client detail sections', () => {
  it('shows Codex layers, MCP, AGENTS, skills, rules, hooks, custom agents, plugins, auth stores, and trust gates', () => {
    const detected = detectCodex([{
      path: '/home/user/.codex/config.toml',
      content: `
[mcp_servers.github]
command = "npx"
`
    }, {
      path: '/etc/codex/config.toml',
      content: 'managed = true'
    }, {
      path: '/repo/AGENTS.md',
      content: '# Project instructions'
    }, {
      path: '/home/user/.agents/skills/reviewer/SKILL.md',
      content: '# Reviewer'
    }, {
      path: '/repo/.codex/rules/review.rules',
      content: 'prefer tests'
    }, {
      path: '/repo/.codex/config.toml',
      content: `
[mcp_servers.local]
command = "node"

[hooks.pre_request]
command = "echo"

[agents.reviewer]
path = ".codex/agents/reviewer.toml"
`
    }, {
      path: '/repo/.codex/agents/reviewer.toml',
      content: 'name = "reviewer"'
    }, {
      path: '/home/user/.agents/plugins/acme/plugin.json',
      content: '{}'
    }, {
      path: '/home/user/.codex/auth.json',
      sizeBytes: 1024
    }]);
    const detail = buildClientDetailModel(createEmptyScanSummary({
      resources: detected.resources,
      parseErrors: detected.parseErrors
    }), 'codex');

    const sections = buildCodexDetailSections(detail);
    const ids = sections.map((section) => section.id);
    const layers = sections.find((section) => section.id === 'codex-layers');
    const mcp = sections.find((section) => section.id === 'codex-mcp');
    const trust = sections.find((section) => section.id === 'codex-trust-gates');

    expect(ids).toEqual(expect.arrayContaining([
      'codex-layers',
      'codex-mcp',
      'codex-agents-files',
      'codex-skills-rules',
      'codex-hooks-agents',
      'codex-plugins',
      'codex-auth-stores',
      'codex-trust-gates'
    ]));
    expect(layers?.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/home/user/.codex/config.toml', value: expect.stringContaining('global') }),
      expect.objectContaining({ path: '/repo/AGENTS.md', value: expect.stringContaining('trust-gated') }),
      expect.objectContaining({ path: '/etc/codex/config.toml', value: expect.stringContaining('managed-admin') })
    ]));
    expect(mcp?.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'github', value: expect.stringContaining('unknown') }),
      expect.objectContaining({ label: 'local', value: expect.stringContaining('trust-gated') })
    ]));
    expect(trust?.rows.some((row) => row.path === '/repo/.codex/rules/review.rules' && row.value.toLowerCase().includes('trust'))).toBe(true);
  });

  it('fixture data answers which Codex layer introduced resources and whether activation is trust-gated or unknown', () => {
    const sections = buildCodexDetailSections(buildClientDetailModel(getFixtureScenario('full-machine').summary, 'codex'));
    const layers = sections.find((section) => section.id === 'codex-layers');
    const mcp = sections.find((section) => section.id === 'codex-mcp');
    const trust = sections.find((section) => section.id === 'codex-trust-gates');

    expect(layers?.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/etc/codex/config.toml', value: 'managed-admin · unknown' }),
      expect.objectContaining({ path: '/repo/AGENTS.md', value: 'project-shared · trust-gated' })
    ]));
    expect(mcp?.rows[0]).toMatchObject({
      label: 'github',
      value: 'global · unknown · mcp_servers.github'
    });
    expect(trust?.rows.some((row) => row.label === 'pre_request' && row.value.toLowerCase().includes('trust'))).toBe(true);
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
