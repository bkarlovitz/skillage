import { describe, expect, it } from 'vitest';
import { analyzeMcpCrossClient } from './mcpCrossClient';
import type { CapabilityClient, CapabilityResource } from './types';

function mcp(input: {
  id: string;
  name: string;
  client: CapabilityClient;
  command?: string;
  args?: string[];
  url?: string;
  envVars?: string[];
  fileSecretRefs?: string[];
  status?: CapabilityResource['status'];
  path?: string;
}): CapabilityResource {
  const path = input.path ?? `/fixtures/${input.client}/mcp.json`;
  return {
    id: input.id,
    name: input.name,
    description: `${input.client} MCP ${input.name}`,
    client: input.client,
    resourceType: 'mcp-server',
    scope: input.client === 'cursor' ? 'project-shared' : 'global',
    status: input.status ?? 'not-tested',
    statuses: ['found', input.status ?? 'not-tested'],
    path,
    evidence: [{
      sourcePath: path,
      scannerRule: `${input.client}-mcp`,
      matchedPathPattern: 'mcp config',
      parsedKeyPath: `mcpServers.${input.name}`,
      readStatus: 'read',
      parseStatus: 'parsed'
    }],
    warnings: [],
    relationships: [],
    tags: ['mcp'],
    metadata: {
      command: input.command ?? '',
      args: input.args ?? [],
      package: input.args?.find((arg) => !arg.startsWith('-')) ?? '',
      url: input.url ?? '',
      envVars: input.envVars ?? [],
      fileSecretRefs: input.fileSecretRefs ?? []
    }
  };
}

describe('MCP cross-client duplicate analysis', () => {
  it('labels duplicate MCP names across Claude Desktop, Codex, and Cursor when launch evidence matches', () => {
    const resources = [
      mcp({ id: 'desktop-github', name: 'github', client: 'claude-desktop', command: 'npx', args: ['-y', '@mcp/github'], envVars: ['GITHUB_TOKEN'] }),
      mcp({ id: 'codex-github', name: 'github', client: 'codex', command: 'npx', args: ['-y', '@mcp/github'] }),
      mcp({ id: 'cursor-github', name: 'github', client: 'cursor', command: 'npx', args: ['-y', '@mcp/github'], fileSecretRefs: ['.env.local'] })
    ];
    const groups = analyzeMcpCrossClient(resources);
    const github = groups.find((group) => group.name === 'github');

    expect(github?.relationshipLabel).toBe('duplicate');
    expect(github?.instances.map((instance) => instance.client).sort()).toEqual(['claude-desktop', 'codex', 'cursor']);
    expect(github?.instances.find((instance) => instance.client === 'claude-desktop')?.envReferences).toEqual(['GITHUB_TOKEN']);
    expect(github?.instances.find((instance) => instance.client === 'cursor')?.fileSecretReferences).toEqual(['.env.local']);
    expect(github?.instances.every((instance) => instance.status === 'not-tested')).toBe(true);
    expect(github?.relationships.every((relationship) => relationship.label === 'duplicate')).toBe(true);
  });

  it('keeps same-name MCP false positives as same-name-only when commands differ across clients', () => {
    const groups = analyzeMcpCrossClient([
      mcp({ id: 'cursor-github', name: 'github', client: 'cursor', command: 'node', args: ['github-local.js'] }),
      mcp({ id: 'codex-github', name: 'github', client: 'codex', command: 'python', args: ['github-remote.py'] })
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].relationshipLabel).toBe('same-name-only');
    expect(groups[0].notes[0]).toContain('Same MCP name alone is weak evidence');
  });

  it('surfaces conflict only for same client and scope with incompatible launch evidence', () => {
    const groups = analyzeMcpCrossClient([
      mcp({ id: 'cursor-one', name: 'github', client: 'cursor', command: 'node', args: ['one.js'], path: '/repo/.cursor/mcp.json' }),
      mcp({ id: 'cursor-two', name: 'github', client: 'cursor', command: 'python', args: ['two.py'], path: '/repo/.cursor/extra-mcp.json' })
    ]);

    expect(groups[0].relationshipLabel).toBe('conflict');
    expect(groups[0].instances.every((instance) => instance.relationshipLabel === 'conflict')).toBe(true);
  });
});
