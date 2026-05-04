import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanRoot, virtualFilesToDevScanSummary } from '../../../vite.config';

function dangerousMcpConfig(markerPath: string) {
  return JSON.stringify({
    mcpServers: {
      markerWriter: {
        command: process.execPath,
        args: ['-e', `require("node:fs").writeFileSync(${JSON.stringify(markerPath)}, "executed")`]
      },
      packageInstaller: {
        command: 'npm',
        args: ['install', '@example/should-not-install']
      },
      authenticator: {
        command: 'curl',
        args: ['https://auth.example.invalid/login'],
        env: {
          API_TOKEN: 'raw-token-value-12345'
        }
      }
    }
  });
}

describe('passive scanner audit', () => {
  it('extracts executable-looking MCP commands as metadata without running them', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skillage-passive-virtual-'));
    const marker = path.join(root, 'mcp-started');
    const installArtifact = path.join(root, 'package-lock.json');

    try {
      const summary = virtualFilesToDevScanSummary([
        {
          path: '/repo/.claude/mcp.json',
          content: dangerousMcpConfig(marker)
        },
        {
          path: '/repo/.cursor/mcp.json',
          content: JSON.stringify({
            mcpServers: {
              shell: {
                command: 'sh',
                args: ['-c', `echo executed > ${marker}`]
              }
            }
          })
        },
        {
          path: '/home/user/.openclaw/sessions/latest.json',
          content: '{"messages":["raw session body with bearer token"]}'
        },
        {
          path: '/home/user/.openclaw/cache/traces/run.json',
          content: '{"trace":"raw cache trace body"}'
        },
        {
          path: '/home/user/.hermes/profiles/default/sessions/session.json',
          content: '{"messages":["raw Hermes session body"]}'
        }
      ], 'root', '/repo');
      const serialized = JSON.stringify(summary);
      const commands = summary.resources
        .filter((resource) => resource.resourceType === 'mcp-server')
        .map((resource) => resource.metadata.command);

      expect(commands).toEqual(expect.arrayContaining([process.execPath, 'npm', 'curl', 'sh']));
      expect(summary.resources.filter((resource) => resource.resourceType === 'mcp-server').every((resource) => (resource.statuses ?? [resource.status]).includes('not-tested'))).toBe(true);
      expect(fs.existsSync(marker)).toBe(false);
      expect(fs.existsSync(installArtifact)).toBe(false);
      expect(serialized).not.toContain('raw-token-value-12345');
      expect(serialized).not.toContain('raw session body');
      expect(serialized).not.toContain('raw cache trace body');
      expect(serialized).not.toContain('raw Hermes session body');
      expect(summary.skippedSensitiveStores.filter((store) => store.resourceType === 'log-session-store')).toHaveLength(3);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('leaves scanned files unchanged during normal root inventory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skillage-passive-root-'));
    const claudeDir = path.join(root, '.claude');
    const configPath = path.join(claudeDir, 'mcp.json');
    const marker = path.join(root, 'mcp-started');
    const nodeModules = path.join(root, 'node_modules');

    try {
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(configPath, dangerousMcpConfig(marker));
      const before = fs.readFileSync(configPath, 'utf8');
      const summary = scanRoot(root);
      const after = fs.readFileSync(configPath, 'utf8');

      expect(summary.resources.some((resource) => resource.resourceType === 'mcp-server')).toBe(true);
      expect(after).toBe(before);
      expect(fs.existsSync(marker)).toBe(false);
      expect(fs.existsSync(nodeModules)).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
