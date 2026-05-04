import { describe, expect, it } from 'vitest';
import { createEmptyScanSummary } from '../scan';
import { createProjectContext } from './context';
import { projectInventoryStates } from './states';

const context = createProjectContext({
  selectedPath: '/repo',
  repoRootPath: '/repo'
});

describe('project inventory states', () => {
  it('covers no project selected without falling back to demo data', () => {
    expect(projectInventoryStates(createEmptyScanSummary(), 0).map((state) => state.kind)).toEqual(['no-project-selected']);
  });

  it('covers selected folder unavailable', () => {
    const summary = createEmptyScanSummary({
      selectedProject: context,
      scanRoots: [{
        path: '/missing',
        label: 'Selected project scan root',
        status: 'not-found',
        evidence: {
          sourcePath: '/missing',
          scannerRule: 'project-inventory',
          matchedPathPattern: '/missing',
          readStatus: 'not-found',
          parseStatus: 'not-applicable'
        }
      }]
    });

    expect(projectInventoryStates(summary, 0).map((state) => state.kind)).toContain('selected-folder-unavailable');
  });

  it('covers no resources found', () => {
    const summary = createEmptyScanSummary({ selectedProject: context });

    expect(projectInventoryStates(summary, 0).map((state) => state.kind)).toEqual(['no-resources-found']);
  });

  it('covers read errors', () => {
    const summary = createEmptyScanSummary({
      selectedProject: context,
      readErrors: [{
        id: 'read-project-config',
        path: '/repo/.cursor/mcp.json',
        message: 'Permission denied.',
        evidence: {
          sourcePath: '/repo/.cursor/mcp.json',
          scannerRule: 'project-inventory',
          matchedPathPattern: '.cursor/mcp.json',
          readStatus: 'unreadable',
          parseStatus: 'skipped'
        }
      }]
    });

    expect(projectInventoryStates(summary, 0).map((state) => state.kind)).toContain('read-errors');
  });

  it('covers git unavailable', () => {
    const gitUnavailable = createProjectContext({
      selectedPath: '/repo',
      gitRootStatus: 'git-unavailable'
    });
    const summary = createEmptyScanSummary({ selectedProject: gitUnavailable });

    expect(projectInventoryStates(summary, 1).map((state) => state.kind)).toContain('git-unavailable');
  });
});
