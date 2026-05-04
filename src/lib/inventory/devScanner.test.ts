import { describe, expect, it } from 'vitest';
import { scanRoot, standardRootCandidates, virtualFilesToDevScanSummary } from '../../../vite.config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Vite dev scanner contract', () => {
  it('converts virtual files to structured scan summaries without raw content', () => {
    const summary = virtualFilesToDevScanSummary([{
      path: '/repo/AGENTS.md',
      content: '# Instructions\nAPI_TOKEN=raw-secret-value'
    }], 'root', '/repo');
    const serialized = JSON.stringify(summary);

    expect(summary.dataSource).toBe('local-scan');
    expect(summary.resources).toHaveLength(1);
    expect(summary.resources[0].resourceType).toBe('instruction-file');
    expect(summary.scanRoots[0].path).toBe('/repo');
    expect(serialized).not.toContain('raw-secret-value');
    expect(serialized).not.toContain('"content"');
  });

  it('scanRoot returns the same structured contract as Tauri commands', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skillage-vite-scan-'));
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Instructions');

    try {
      const summary = scanRoot(root);

      expect(summary.id).toBe('local-root-scan');
      expect(summary.resources).toHaveLength(1);
      expect(summary.knownClientLocations.length).toBeGreaterThan(0);
      expect(summary.readErrors).toEqual([]);
      expect(summary.parseErrors).toEqual([]);
      expect(summary.skippedSensitiveStores).toEqual([]);
      expect(summary.warnings).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses core client detectors for dev scanner summaries', () => {
    const summary = virtualFilesToDevScanSummary([{
      path: '/repo/.cursor/mcp.json',
      content: JSON.stringify({ mcpServers: { filesystem: { command: 'node' } } })
    }], 'root', '/repo');

    expect(summary.resources.some((resource) => resource.client === 'cursor' && resource.resourceType === 'mcp-server')).toBe(true);
    expect(summary.resources.find((resource) => resource.resourceType === 'mcp-server')?.scope).toBe('project-shared');
  });

  it('includes Hermes and OpenClaw detectors in dev scanner summaries', () => {
    const summary = virtualFilesToDevScanSummary([{
      path: '/home/user/.hermes/profiles/default/config.yaml',
      content: 'mcpServers:\n  docs:\n    url: "https://example.invalid/mcp"'
    }, {
      path: '/home/user/.openclaw/openclaw.json',
      content: JSON.stringify({ gateway: { enabled: true } })
    }], 'root', '/home/user');

    expect(summary.resources.some((resource) => resource.client === 'hermes' && resource.resourceType === 'profile')).toBe(true);
    expect(summary.resources.some((resource) => resource.client === 'hermes' && resource.resourceType === 'mcp-server')).toBe(true);
    expect(summary.resources.some((resource) => resource.client === 'openclaw' && resource.resourceType === 'client-installation')).toBe(true);
    expect(summary.resources.some((resource) => resource.client === 'openclaw' && resource.warnings.some((warning) => warning.message.includes('gateway/remote')))).toBe(true);
  });

  it('defines standard root candidates for all six clients', () => {
    const roots = standardRootCandidates('/Users/alice', '/Users/alice/AppData/Roaming').map((root) => root.replace(/\\/g, '/'));

    expect(roots.some((root) => root.endsWith('/.claude'))).toBe(true);
    expect(roots.some((root) => root.includes('/Claude'))).toBe(true);
    expect(roots.some((root) => root.endsWith('/.codex'))).toBe(true);
    expect(roots.some((root) => root.endsWith('/.cursor'))).toBe(true);
    expect(roots.some((root) => root.endsWith('/.hermes'))).toBe(true);
    expect(roots.some((root) => root.endsWith('/.openclaw'))).toBe(true);
  });
});
