import { describe, expect, it } from 'vitest';
import {
  capabilityClients,
  capabilityRelationshipKinds,
  capabilityResourceTypes,
  capabilityScopes,
  capabilityStatuses,
  capabilityWarningKinds,
  isCapabilityClient,
  isCapabilityResourceType,
  isCapabilityScope,
  isCapabilityStatus,
  type CapabilityClient,
  type CapabilityResource,
  type CapabilityResourceType,
  type CapabilityScope,
  type CapabilityStatus
} from './types';

describe('inventory domain types', () => {
  it('keeps v1 clients as a dedicated value set', () => {
    expect(capabilityClients).toEqual([
      'claude-code',
      'claude-desktop',
      'codex',
      'cursor',
      'hermes',
      'openclaw'
    ]);
    expect(isCapabilityClient('codex')).toBe(true);
    expect(isCapabilityClient('mcp-server')).toBe(false);
  });

  it('keeps resource types separate from clients and scopes', () => {
    expect(capabilityResourceTypes).toEqual([
      'client-installation',
      'config-file',
      'mcp-server',
      'skill',
      'instruction-file',
      'rule',
      'permission',
      'hook',
      'plugin',
      'custom-agent',
      'profile',
      'workspace',
      'sensitive-store',
      'log-session-store',
      'migration-import-source'
    ]);
    expect(isCapabilityResourceType('mcp-server')).toBe(true);
    expect(isCapabilityResourceType('project-shared')).toBe(false);
  });

  it('keeps scopes and statuses separate', () => {
    expect(capabilityScopes).toEqual([
      'global',
      'project-shared',
      'local-private',
      'profile',
      'managed-admin',
      'plugin-bundled',
      'unknown'
    ]);
    expect(capabilityStatuses).toContain('read-error');
    expect(capabilityStatuses).toContain('needs-review');
    expect(isCapabilityScope('project-shared')).toBe(true);
    expect(isCapabilityScope('found')).toBe(false);
    expect(isCapabilityStatus('found')).toBe(true);
    expect(isCapabilityStatus('project-shared')).toBe(false);
  });

  it('defines warnings, relationships, evidence, and resource shape', () => {
    expect(capabilityWarningKinds).toEqual([
      'parse-read-problem',
      'scope-concern',
      'duplication-conflict',
      'secret-auth-concern',
      'runtime-caveat'
    ]);
    expect(capabilityRelationshipKinds).toContain('included-from');
    expect(capabilityRelationshipKinds).toContain('provided-by-plugin');

    const resource: CapabilityResource = {
      id: 'codex-project-mcp-github',
      name: 'github',
      description: 'Project MCP server configured for Codex',
      client: 'codex',
      resourceType: 'mcp-server',
      scope: 'project-shared',
      status: 'found',
      statuses: ['found', 'not-tested', 'needs-review'],
      path: '/repo/.codex/config.toml',
      evidence: [{
        sourcePath: '/repo/.codex/config.toml',
        scannerRule: 'codex-project-config',
        matchedPathPattern: '.codex/config.toml',
        parsedKeyPath: 'mcp_servers.github',
        readStatus: 'read',
        parseStatus: 'parsed'
      }],
      warnings: [{
        kind: 'runtime-caveat',
        severity: 'info',
        message: 'MCP server is configured but not tested.'
      }],
      relationships: [],
      tags: ['mcp'],
      metadata: { command: 'node', trustGated: true }
    };

    expect(resource.client).toBe('codex');
    expect(resource.resourceType).toBe('mcp-server');
    expect(resource.evidence[0].parsedKeyPath).toBe('mcp_servers.github');
  });
});

function acceptsClient(client: CapabilityClient): CapabilityClient {
  return client;
}

function acceptsResourceType(resourceType: CapabilityResourceType): CapabilityResourceType {
  return resourceType;
}

function acceptsScope(scope: CapabilityScope): CapabilityScope {
  return scope;
}

function acceptsStatus(status: CapabilityStatus): CapabilityStatus {
  return status;
}

acceptsClient('claude-desktop');
acceptsResourceType('mcp-server');
acceptsScope('project-shared');
acceptsStatus('found');

// @ts-expect-error clients and resource types are intentionally distinct
acceptsClient('mcp-server');

// @ts-expect-error scopes and statuses are intentionally distinct
acceptsScope('found');

// @ts-expect-error resource types and scopes are intentionally distinct
acceptsResourceType('project-shared');
