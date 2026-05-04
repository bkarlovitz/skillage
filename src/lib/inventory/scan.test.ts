import { describe, expect, it } from 'vitest';
import { createEmptyScanSummary, type ScanParseError, type ScanReadError, type SkippedSensitiveStore } from './scan';

describe('scan summary contract', () => {
  it('distinguishes scan roots, known client locations, selected project, and resources', () => {
    const summary = createEmptyScanSummary({
      id: 'fixture-full-machine',
      dataSource: 'fixture',
      selectedProject: {
        rootPath: '/repo/skillage',
        selectedPath: '/repo/skillage/apps/web',
        repoRootPath: '/repo/skillage',
        scanRootPath: '/repo/skillage',
        displayName: 'skillage',
        activeProfile: 'default',
        trustState: 'unknown',
        gitRootStatus: 'found'
      },
      scanRoots: [{
        path: '~/.codex',
        label: 'Codex home',
        status: 'scanned',
        client: 'codex',
        scope: 'global',
        evidence: {
          sourcePath: '~/.codex',
          scannerRule: 'codex-home',
          matchedPathPattern: '~/.codex',
          readStatus: 'read',
          parseStatus: 'not-applicable'
        }
      }],
      knownClientLocations: [{
        client: 'claude-desktop',
        label: 'Claude Desktop config',
        path: '~/Library/Application Support/Claude/claude_desktop_config.json',
        exists: false,
        scope: 'global',
        resourceType: 'config-file',
        evidence: {
          sourcePath: '~/Library/Application Support/Claude/claude_desktop_config.json',
          scannerRule: 'claude-desktop-config',
          matchedPathPattern: 'claude_desktop_config.json',
          readStatus: 'not-found',
          parseStatus: 'not-applicable'
        }
      }]
    });

    expect(summary.dataSource).toBe('fixture');
    expect(summary.selectedProject?.displayName).toBe('skillage');
    expect(summary.selectedProject?.selectedPath).toBe('/repo/skillage/apps/web');
    expect(summary.selectedProject?.scanRootPath).toBe('/repo/skillage');
    expect(summary.scanRoots[0].client).toBe('codex');
    expect(summary.knownClientLocations[0].exists).toBe(false);
    expect(summary.resources).toEqual([]);
  });

  it('represents read errors without raw content', () => {
    const readError: ScanReadError = {
      id: 'read-auth-json',
      client: 'openclaw',
      path: '~/.openclaw/auth.json',
      message: 'Permission denied.',
      evidence: {
        sourcePath: '~/.openclaw/auth.json',
        scannerRule: 'openclaw-auth-store',
        matchedPathPattern: '~/.openclaw/auth.json',
        readStatus: 'unreadable',
        parseStatus: 'skipped'
      }
    };

    const summary = createEmptyScanSummary({ readErrors: [readError] });

    expect(summary.readErrors[0].evidence.readStatus).toBe('unreadable');
    expect('rawContent' in summary.readErrors[0]).toBe(false);
  });

  it('represents parse errors with parsed key evidence and without raw content', () => {
    const parseError: ScanParseError = {
      id: 'parse-cursor-mcp',
      client: 'cursor',
      path: '/repo/.cursor/mcp.json',
      message: 'Unexpected token at line 4.',
      evidence: {
        sourcePath: '/repo/.cursor/mcp.json',
        scannerRule: 'cursor-project-mcp',
        matchedPathPattern: '.cursor/mcp.json',
        parsedKeyPath: 'mcpServers',
        readStatus: 'read',
        parseStatus: 'parse-error'
      }
    };

    const summary = createEmptyScanSummary({ parseErrors: [parseError] });

    expect(summary.parseErrors[0].evidence.parsedKeyPath).toBe('mcpServers');
    expect('rawContent' in summary.parseErrors[0]).toBe(false);
  });

  it('represents skipped sensitive and log stores without preview content', () => {
    const skipped: SkippedSensitiveStore = {
      id: 'skip-hermes-session-log',
      client: 'hermes',
      resourceType: 'log-session-store',
      scope: 'profile',
      path: '~/.hermes/profiles/default/sessions',
      reason: 'Session content is metadata-only by default.',
      evidence: {
        sourcePath: '~/.hermes/profiles/default/sessions',
        scannerRule: 'hermes-session-store',
        matchedPathPattern: '~/.hermes/profiles/*/sessions',
        readStatus: 'skipped',
        parseStatus: 'skipped'
      }
    };

    const summary = createEmptyScanSummary({ skippedSensitiveStores: [skipped] });

    expect(summary.skippedSensitiveStores[0].resourceType).toBe('log-session-store');
    expect('rawContent' in summary.skippedSensitiveStores[0]).toBe(false);
    expect('preview' in summary.skippedSensitiveStores[0]).toBe(false);
  });
});
