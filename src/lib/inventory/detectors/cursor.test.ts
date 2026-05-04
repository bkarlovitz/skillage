import { describe, expect, it } from 'vitest';
import { detectCursor } from './cursor';

describe('Cursor detector', () => {
  it('detects global MCP config separately from project scope', () => {
    const result = detectCursor([{
      path: '/home/user/.cursor/mcp.json',
      content: JSON.stringify({ mcpServers: { github: { command: 'npx' } } })
    }]);

    const config = result.resources.find((resource) => resource.resourceType === 'config-file');
    const server = result.resources.find((resource) => resource.resourceType === 'mcp-server');

    expect(config?.name).toBe('Cursor global MCP config');
    expect(config?.scope).toBe('global');
    expect(server?.scope).toBe('global');
  });

  it('detects project MCP config separately from global MCP', () => {
    const result = detectCursor([{
      path: '/repo/.cursor/mcp.json',
      content: JSON.stringify({ mcpServers: { filesystem: { command: 'node' } } })
    }]);

    const config = result.resources.find((resource) => resource.resourceType === 'config-file');
    const server = result.resources.find((resource) => resource.resourceType === 'mcp-server');

    expect(config?.name).toBe('Cursor project MCP config');
    expect(config?.scope).toBe('project-shared');
    expect(server?.scope).toBe('project-shared');
    expect(server?.status).toBe('not-tested');
  });

  it('detects valid MDC project rules', () => {
    const result = detectCursor([{
      path: '/repo/.cursor/rules/svelte.mdc',
      content: `---
description: Svelte rules
globs: **/*.svelte
alwaysApply: true
---
# Rule`
    }]);

    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].name).toBe('Svelte rules');
    expect(result.resources[0].scope).toBe('project-shared');
    expect(result.resources[0].warnings).toEqual([]);
  });

  it('surfaces malformed MDC frontmatter and schema mismatch warnings', () => {
    const result = detectCursor([{
      path: '/repo/.cursor/rules/bad.mdc',
      content: `---
description: Bad rule
globs: ["src/**"]
alwaysApply: yes
# missing closing delimiter`
    }]);

    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].status).toBe('parse-error');
    expect(result.resources[0].warnings.some((warning) => warning.severity === 'error')).toBe(true);
    expect(result.resources[0].warnings.some((warning) => warning.message.includes('closing frontmatter'))).toBe(true);
  });

  it('warns on MDC frontmatter schema mismatches', () => {
    const result = detectCursor([{
      path: '/repo/.cursor/rules/schema.mdc',
      content: `---
description: Schema mismatch
globs: ["src/**"]
alwaysApply: yes
---
# Rule`
    }]);

    expect(result.resources[0].status).toBe('found');
    expect(result.resources[0].warnings.some((warning) => warning.message.includes('globs should be'))).toBe(true);
    expect(result.resources[0].warnings.some((warning) => warning.message.includes('alwaysApply should be'))).toBe(true);
  });

  it('detects legacy .cursorrules with migration warning', () => {
    const result = detectCursor([{
      path: '/repo/.cursorrules',
      content: 'Use Svelte 5 runes.'
    }]);

    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].resourceType).toBe('rule');
    expect(result.resources[0].status).toBe('needs-review');
    expect(result.resources[0].warnings[0].message).toContain('Legacy .cursorrules');
  });
});
