import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanRoot } from '../../../vite.config';
import { machineInventoryEmptyState } from './emptyStates';
import { getFixtureScenario } from './fixtures';
import { createProjectContext } from './project/context';
import { scanProjectInventory } from './project/scanner';
import { projectInventoryStates } from './project/states';

describe('empty scan regressions', () => {
  it('keeps a real empty machine root scan empty without loading fixtures', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skillage-empty-machine-'));

    try {
      const summary = scanRoot(root);
      const state = machineInventoryEmptyState(summary);
      const serialized = JSON.stringify(summary);

      expect(getFixtureScenario('full-machine').summary.resources.length).toBeGreaterThan(0);
      expect(summary.dataSource).toBe('local-scan');
      expect(summary.resources).toEqual([]);
      expect(summary.id).toBe('local-root-scan');
      expect(state).toMatchObject({
        title: 'No local capability resources found.'
      });
      expect(serialized).not.toContain('fixture-full-machine');
      expect(serialized).not.toContain('full-claude-code-installation');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps an empty project scan empty and renders project empty-state rows', async () => {
    const context = createProjectContext({
      selectedPath: '/repo',
      repoRootPath: '/repo'
    });
    const summary = await scanProjectInventory({
      context,
      generatedAt: new Date(0).toISOString(),
      files: []
    });
    const states = projectInventoryStates(summary, summary.resources.length);
    const serialized = JSON.stringify(summary);

    expect(summary.dataSource).toBe('local-scan');
    expect(summary.selectedProject?.scanRootPath).toBe('/repo');
    expect(summary.resources).toEqual([]);
    expect(summary.parseErrors).toEqual([]);
    expect(summary.readErrors).toEqual([]);
    expect(states).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: 'No project resources found',
        kind: 'no-resources-found'
      })
    ]));
    expect(serialized).not.toContain('fixture-project-inherited-globals');
    expect(serialized).not.toContain('project-inherited-global-github');
  });
});
