import { invoke } from '@tauri-apps/api/core';
import { parseVirtualFiles, type VirtualFile } from './adapters';
import type { SkillItem } from './types';

export type RuntimeKind = 'tauri' | 'browser-dev' | 'browser-production';

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function runtimeKind(): RuntimeKind {
  if (isTauriRuntime()) return 'tauri';
  return import.meta.env.DEV ? 'browser-dev' : 'browser-production';
}

export function runtimeLabel(): string {
  switch (runtimeKind()) {
    case 'tauri':
      return 'Desktop mode';
    case 'browser-dev':
      return 'Browser dev mode';
    case 'browser-production':
      return 'Browser preview mode';
  }
}

async function scanViaDevServer(endpoint: string): Promise<SkillItem[]> {
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`Dev scanner failed: ${response.status}`);
  const files = await response.json() as VirtualFile[];
  return parseVirtualFiles(files);
}

export async function scanRoot(root: string): Promise<SkillItem[]> {
  if (isTauriRuntime()) {
    const files = await invoke<VirtualFile[]>('scan_skill_files', { root });
    return parseVirtualFiles(files);
  }

  if (import.meta.env.DEV) {
    return scanViaDevServer(`/api/scan-root?root=${encodeURIComponent(root)}`);
  }

  throw new Error('Local scanning requires the Skillage desktop app.');
}

export async function scanStandardLocations(): Promise<SkillItem[]> {
  if (isTauriRuntime()) {
    const files = await invoke<VirtualFile[]>('scan_standard_skill_files');
    return parseVirtualFiles(files);
  }

  if (import.meta.env.DEV) {
    return scanViaDevServer('/api/scan-standard');
  }

  throw new Error('Standard-location scanning requires the Skillage desktop app.');
}
