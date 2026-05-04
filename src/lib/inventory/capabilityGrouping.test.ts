import { describe, expect, it } from 'vitest';
import { buildCapabilityGroupingKeys, groupCapabilities, launchSignature } from './capabilityGrouping';
import type { CapabilityClient, CapabilityResource, CapabilityResourceType } from './types';

function resource(id: string, overrides: Partial<CapabilityResource> = {}): CapabilityResource {
  return {
    id,
    name: overrides.name ?? id,
    description: overrides.description ?? id,
    client: overrides.client ?? 'cursor',
    resourceType: overrides.resourceType ?? 'mcp-server',
    scope: overrides.scope ?? 'global',
    status: overrides.status ?? 'found',
    path: overrides.path ?? `/fixtures/${id}.json`,
    evidence: overrides.evidence ?? [{
      sourcePath: overrides.path ?? `/fixtures/${id}.json`,
      scannerRule: `${overrides.client ?? 'cursor'}-test`,
      matchedPathPattern: '*.json',
      parsedKeyPath: overrides.resourceType === 'mcp-server' ? `mcpServers.${overrides.name ?? id}` : undefined,
      readStatus: 'read',
      parseStatus: 'parsed'
    }],
    warnings: overrides.warnings ?? [],
    relationships: overrides.relationships ?? [],
    tags: overrides.tags ?? [],
    metadata: overrides.metadata ?? {}
  };
}

function mcp(id: string, name: string, client: CapabilityClient, command: string, args: string[] = []): CapabilityResource {
  return resource(id, {
    name,
    client,
    resourceType: 'mcp-server',
    metadata: {
      command,
      args,
      package: args.find((arg) => !arg.startsWith('-')) ?? ''
    }
  });
}

describe('capability grouping keys', () => {
  it('keeps same MCP name with different command hints in separate primary groups', () => {
    const node = mcp('cursor-github', 'github', 'cursor', 'node', ['server.js']);
    const python = mcp('codex-github', 'github', 'codex', 'python', ['server.py']);

    expect(buildCapabilityGroupingKeys(node).nameKey).toBe(buildCapabilityGroupingKeys(python).nameKey);
    expect(buildCapabilityGroupingKeys(node).primaryKey).not.toBe(buildCapabilityGroupingKeys(python).primaryKey);
    expect(groupCapabilities([node, python]).filter((group) => group.resourceType === 'mcp-server')).toHaveLength(2);
  });

  it('groups same MCP command/package with different names by launch signature', () => {
    const github = mcp('cursor-github', 'github', 'cursor', 'npx', ['-y', '@mcp/github']);
    const gh = mcp('codex-gh', 'gh', 'codex', 'npx', ['-y', '@mcp/github']);
    const groups = groupCapabilities([github, gh]);

    expect(launchSignature(github)).toBe(launchSignature(gh));
    expect(buildCapabilityGroupingKeys(github).primaryKey).toBe(buildCapabilityGroupingKeys(gh).primaryKey);
    expect(groups).toHaveLength(1);
    expect(groups[0].clients).toEqual(['codex', 'cursor']);
    expect(groups[0].relatedKeys).toEqual(expect.arrayContaining([
      'mcp-server:name:github',
      'mcp-server:name:gh'
    ]));
  });

  it('groups same skill name in different clients while retaining source and client evidence keys', () => {
    const claude = resource('claude-reviewer', {
      name: 'reviewer',
      client: 'claude-code',
      resourceType: 'skill',
      path: '/home/user/.claude/skills/reviewer/SKILL.md'
    });
    const codex = resource('codex-reviewer', {
      name: 'reviewer',
      client: 'codex',
      resourceType: 'skill',
      path: '/home/user/.agents/skills/reviewer/SKILL.md'
    });
    const groups = groupCapabilities([claude, codex]);

    expect(buildCapabilityGroupingKeys(claude).primaryKey).toBe('skill:name:reviewer');
    expect(groups).toHaveLength(1);
    expect(groups[0].clients).toEqual(['claude-code', 'codex']);
    expect(groups[0].sourceLocations).toEqual([
      '/home/user/.agents/skills/reviewer/SKILL.md',
      '/home/user/.claude/skills/reviewer/SKILL.md'
    ]);
    expect(groups[0].relatedKeys.some((key) => key.includes('client-evidence:claude-code'))).toBe(true);
    expect(groups[0].relatedKeys.some((key) => key.includes('client-evidence:codex'))).toBe(true);
  });

  it.each<CapabilityResourceType>(['instruction-file', 'rule', 'hook', 'plugin', 'sensitive-store', 'profile'])('builds stable keys for %s resources', (resourceType) => {
    const item = resource(`${resourceType}-one`, {
      name: 'Shared Name',
      resourceType,
      path: resourceType === 'sensitive-store' ? '/home/user/.codex/auth.json' : `/repo/${resourceType}`
    });
    const keys = buildCapabilityGroupingKeys(item);

    expect(keys.nameKey).toBe(`${resourceType}:name:shared-name`);
    expect(keys.sourceKey).toContain(resourceType);
    expect(keys.clientEvidenceKey).toContain(item.client);
    expect(keys.relatedKeys).toEqual(expect.arrayContaining([keys.nameKey, keys.sourceKey, keys.clientEvidenceKey]));
  });
});
