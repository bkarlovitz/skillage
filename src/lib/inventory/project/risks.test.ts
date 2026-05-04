import { describe, expect, it } from 'vitest';
import { resource } from '../detectors/common';
import type { CapabilityResource, CapabilityResourceType } from '../types';
import { projectRiskWarnings, withProjectRiskWarnings, type ProjectRiskCategory } from './risks';

function testResource(overrides: Partial<CapabilityResource> = {}): CapabilityResource {
  return resource({
    id: overrides.id ?? 'risk-resource',
    name: overrides.name ?? 'Risk resource',
    description: overrides.description ?? 'Risk resource.',
    client: overrides.client ?? 'codex',
    resourceType: overrides.resourceType ?? 'config-file' as CapabilityResourceType,
    scope: overrides.scope ?? 'project-shared',
    status: overrides.status ?? 'found',
    path: overrides.path ?? '/repo/.codex/config.toml',
    evidence: overrides.evidence ?? [{
      sourcePath: overrides.path ?? '/repo/.codex/config.toml',
      scannerRule: 'test-resource',
      matchedPathPattern: 'test',
      readStatus: 'read',
      parseStatus: 'parsed'
    }],
    warnings: overrides.warnings,
    tags: overrides.tags,
    metadata: overrides.metadata
  });
}

function categories(resource: CapabilityResource): ProjectRiskCategory[] {
  return projectRiskWarnings(resource).map((warning) => warning.projectRisk);
}

describe('project risk warnings', () => {
  it('warns for project MCP servers', () => {
    expect(categories(testResource({ resourceType: 'mcp-server' }))).toContain('project-mcp-server');
  });

  it('warns for hooks and command tags', () => {
    expect(categories(testResource({ resourceType: 'hook' }))).toContain('project-hook-command');
    expect(categories(testResource({ tags: ['command'] }))).toContain('project-hook-command');
  });

  it('warns for broad permissions', () => {
    expect(categories(testResource({ resourceType: 'permission' }))).toContain('broad-permission');
    expect(categories(testResource({ metadata: { permissions: ['Bash(*)'] } }))).toContain('broad-permission');
  });

  it('warns for inline secret-like values', () => {
    expect(categories(testResource({
      warnings: [{
        kind: 'secret-auth-concern',
        severity: 'warning',
        message: 'Secret-like JSON field mcpServers.github.env.API_TOKEN was redacted before preview.'
      }]
    }))).toContain('inline-secret');
  });

  it('warns for executable project config', () => {
    expect(categories(testResource({
      resourceType: 'config-file',
      metadata: { command: 'node' }
    }))).toContain('executable-config');
  });

  it('warns for local/private files not visible to collaborators', () => {
    expect(categories(testResource({ scope: 'local-private' }))).toContain('local-private-collaboration');
  });

  it('warns for project-shared files likely committed to git', () => {
    expect(categories(testResource({ metadata: { gitFileState: 'tracked' } }))).toContain('shared-committed-file');
  });

  it('attaches risk categories to resource metadata without duplicating warnings', () => {
    const output = withProjectRiskWarnings(testResource({
      resourceType: 'mcp-server',
      metadata: { gitFileState: 'tracked', command: 'node' }
    }));

    expect(output.metadata.projectRiskCategories).toEqual(expect.arrayContaining([
      'project-mcp-server',
      'executable-config',
      'shared-committed-file'
    ]));
    expect(new Set(output.warnings.map((warning) => warning.message)).size).toBe(output.warnings.length);
  });
});
