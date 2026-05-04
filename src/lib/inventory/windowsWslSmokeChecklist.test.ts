import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Windows WSL smoke checklist', () => {
  const checklist = readFileSync(resolve(process.cwd(), 'docs/WINDOWS_WSL_SMOKE_TEST.md'), 'utf8');

  it('documents the exact Windows build commands', () => {
    expect(checklist).toContain('npm ci');
    expect(checklist).toContain('npm run test -- src/lib/inventory/locations.test.ts src/lib/inventory/project/context.test.ts src/lib/inventory/project/scope.test.ts');
    expect(checklist).toContain('npm run check');
    expect(checklist).toContain('npm run build');
    expect(checklist).toContain('npm run tauri:build');
    expect(checklist).toContain('npm run tauri:dev');
  });

  it('covers WSL namespace discovery, duplicate handling, and safe UI outcomes', () => {
    expect(checklist).toContain(String.raw`\\wsl.localhost\<distro>\home\<wsl-user>`);
    expect(checklist).toContain(String.raw`\\wsl$\<distro>\home\<wsl-user>`);
    expect(checklist).toContain('duplicate WSL namespace paths collapse to one logical row per client location');
    expect(checklist).toContain('Windows user roots and WSL home roots');
    expect(checklist).toContain('Known locations');
    expect(checklist).toContain('Safe Detail Panels');
    expect(checklist).toContain('unread-sensitive');
    expect(checklist).toContain('metadata-only');
    expect(checklist).toContain('sk-smoke-secret-value');
    expect(checklist).toContain('raw-session-secret');
  });
});
