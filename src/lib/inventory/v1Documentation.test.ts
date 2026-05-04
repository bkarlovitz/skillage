import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readDoc(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('v1 documentation', () => {
  const readme = readDoc('README.md');
  const implementation = readDoc('docs/IMPLEMENTATION_PLAN.md');
  const scannerPermissions = readDoc('docs/SCANNER_PERMISSIONS.md');
  const parserStrategy = readDoc('docs/PARSER_STRATEGY.md');

  it('describes the v1 inventory surfaces and supported clients', () => {
    for (const term of [
      'Machine Inventory',
      'Project Inventory',
      'Clients',
      'Cross-Client',
      'Claude Code',
      'Claude Desktop',
      'Codex',
      'Cursor',
      'Hermes',
      'OpenClaw',
      String.raw`\\wsl.localhost`,
      String.raw`\\wsl$`
    ]) {
      expect(readme).toContain(term);
    }
  });

  it('keeps write, install, marketplace, hosted, and sync flows as v1 non-goals', () => {
    const nonGoals = readme.slice(readme.indexOf('## Non-Goals For V1'));

    for (const term of [
      'prompt authoring tool',
      'config editor',
      'package installer',
      'marketplace',
      'publishing flow',
      'hosted service',
      'cross-machine sync'
    ]) {
      expect(nonGoals).toContain(term);
    }
  });

  it('removes stale current-state MVP and sprint labels from active docs', () => {
    expect(readme).not.toMatch(/MVP status|MVP scanner/);
    expect(implementation).not.toMatch(/MVP|Sprint \d/);
    expect(scannerPermissions).not.toContain('Sprint 2');
    expect(parserStrategy).not.toContain('Sprint 3');
  });
});
