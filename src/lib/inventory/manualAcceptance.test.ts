import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { capabilityClients } from './types';

describe('manual acceptance notes', () => {
  const notes = readFileSync(resolve(process.cwd(), 'docs/MANUAL_ACCEPTANCE.md'), 'utf8');

  it('covers every required user walkthrough surface', () => {
    for (const section of [
      'No Project Selected',
      'Selected Project',
      'Client Detail Views',
      'Cross-Client View',
      'Source-Path Clarity',
      'Safety'
    ]) {
      expect(notes).toContain(section);
    }
  });

  it('confirms each supported client detail view', () => {
    for (const client of capabilityClients) {
      const displayName = {
        'claude-code': 'Claude Code',
        'claude-desktop': 'Claude Desktop',
        codex: 'Codex',
        cursor: 'Cursor',
        hermes: 'Hermes',
        openclaw: 'OpenClaw'
      }[client];

      expect(notes).toContain(`${displayName}:`);
    }
  });

  it('records the v1 outcome categories and validation commands', () => {
    for (const term of [
      'Machine Inventory',
      'Project Inventory',
      'Cross-Client',
      'Source Evidence',
      'unread-sensitive',
      'metadata-only',
      'npm run check',
      'npm run build',
      'Final result: accepted for v1 local acceptance.'
    ]) {
      expect(notes).toContain(term);
    }
  });
});
