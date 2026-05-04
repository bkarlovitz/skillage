import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('packaging quality gate report', () => {
  const report = readFileSync(resolve(process.cwd(), 'docs/PACKAGING_QUALITY_GATES.md'), 'utf8');

  it('records the standard web and desktop gate commands', () => {
    for (const command of [
      'npm run test',
      'cargo test',
      'npm run check',
      'npm run build',
      'npm run tauri:build'
    ]) {
      expect(report).toContain(command);
    }
  });

  it('captures Linux bundle outputs and the Windows environment limit', () => {
    expect(report).toContain('src-tauri/target/release/bundle/deb/Skillage_0.1.0_amd64.deb');
    expect(report).toContain('src-tauri/target/release/bundle/rpm/Skillage-0.1.0-1.x86_64.rpm');
    expect(report).toContain('src-tauri/target/release/bundle/appimage/Skillage_0.1.0_amd64.AppImage');
    expect(report).toContain('does not prove a native Windows installer');
    expect(report).toContain('docs/WINDOWS_WSL_SMOKE_TEST.md');
  });
});
