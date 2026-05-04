import { describe, expect, it } from 'vitest';
import { createProjectContext, type GitCommandRunner } from './context';
import { scanProjectInventory } from './scanner';

const context = createProjectContext({
  selectedPath: '/repo',
  repoRootPath: '/repo'
});

describe('project inventory scanner', () => {
  it('detects project MCP, hooks, instructions, skills, and local/private resources with safe previews', async () => {
    const runGit: GitCommandRunner = async (_cwd, args) => ({
      exitCode: args[0] === 'ls-files' ? 0 : 1,
      stdout: ''
    });

    const summary = await scanProjectInventory({
      context,
      generatedAt: new Date(0).toISOString(),
      runGit,
      files: [{
        path: '/repo/.cursor/mcp.json',
        content: JSON.stringify({
          mcpServers: {
            github: {
              command: 'node',
              args: ['server.js'],
              env: { API_TOKEN: 'secret-token-value-12345' }
            }
          }
        })
      }, {
        path: '/repo/.codex/config.toml',
        content: '[hooks.review]\ncommand = "npm"\n'
      }, {
        path: '/repo/AGENTS.md',
        content: '# Project instructions'
      }, {
        path: '/repo/.claude/skills/review/SKILL.md',
        content: '# Review skill'
      }, {
        path: '/repo/.claude/settings.local.json',
        content: '{"permissions":{"allow":["Bash(npm test)"]}}'
      }]
    });

    expect(summary.selectedProject).toBe(context);
    expect(summary.scanRoots[0].path).toBe('/repo');
    expect(summary.resources.some((item) => item.resourceType === 'mcp-server' && item.name === 'github')).toBe(true);
    expect(summary.resources.some((item) => item.resourceType === 'hook' && item.client === 'codex')).toBe(true);
    expect(summary.resources.some((item) => item.resourceType === 'instruction-file' && item.path === '/repo/AGENTS.md')).toBe(true);
    expect(summary.resources.some((item) => item.resourceType === 'skill' && item.path === '/repo/.claude/skills/review/SKILL.md')).toBe(true);
    expect(summary.resources.find((item) => item.path === '/repo/.claude/settings.local.json')?.scope).toBe('local-private');
    expect(summary.resources.every((item) => item.metadata.gitFileState === 'tracked')).toBe(true);
    expect(JSON.stringify(summary)).not.toContain('secret-token-value-12345');
    expect(summary.resources.some((item) => item.warnings.some((warning) => warning.kind === 'secret-auth-concern'))).toBe(true);
  });

  it('represents project secret-like config and log/session files as metadata only', async () => {
    const summary = await scanProjectInventory({
      context,
      generatedAt: new Date(0).toISOString(),
      files: [{
        path: '/repo/.codex/auth.json',
        content: '{"token":"raw-auth-token"}'
      }, {
        path: '/repo/.claude/sessions/latest.json',
        content: '{"messages":["raw session body"]}'
      }]
    });

    const auth = summary.resources.find((item) => item.path === '/repo/.codex/auth.json');
    const session = summary.resources.find((item) => item.path === '/repo/.claude/sessions/latest.json');

    expect(auth?.resourceType).toBe('sensitive-store');
    expect(auth?.previewPolicy).toBe('unread-sensitive');
    expect(session?.resourceType).toBe('log-session-store');
    expect(session?.previewPolicy).toBe('metadata-only');
    expect(summary.skippedSensitiveStores.some((store) => store.path === '/repo/.claude/sessions/latest.json')).toBe(true);
    expect(JSON.stringify(summary)).not.toContain('raw-auth-token');
    expect(JSON.stringify(summary)).not.toContain('raw session body');
  });
});
