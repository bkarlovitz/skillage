import { describe, expect, it } from 'vitest';
import { knownClientLocationsForPlatform, knownLocationDefinitions, type OsFamily } from './locations';
import { capabilityClients } from './types';

const osFamilies: OsFamily[] = ['linux', 'macos', 'windows', 'wsl'];

describe('known location registry', () => {
  it('covers every supported client', () => {
    expect(new Set(knownLocationDefinitions.map((definition) => definition.client))).toEqual(new Set(capabilityClients));
  });

  it('covers every supported OS family for every client', () => {
    for (const definition of knownLocationDefinitions) {
      for (const family of osFamilies) {
        expect(definition.roots[family].length, `${definition.id} ${family}`).toBeGreaterThan(0);
      }
    }
  });

  it('returns known-but-not-found evidence for missing locations', () => {
    const locations = knownClientLocationsForPlatform('linux', { home: '/home/alice' });

    expect(locations.length).toBeGreaterThan(capabilityClients.length);
    expect(locations.every((location) => location.exists === false)).toBe(true);
    expect(locations.every((location) => location.evidence.readStatus === 'not-found')).toBe(true);
  });

  it('marks existing paths while preserving missing evidence for the rest', () => {
    const locations = knownClientLocationsForPlatform('macos', { home: '/Users/alice' }, ['/Users/alice/.claude']);
    const claude = locations.find((location) => location.path === '/Users/alice/.claude');

    expect(claude?.exists).toBe(true);
    expect(claude?.evidence.readStatus).toBe('read');
    expect(locations.some((location) => location.exists === false)).toBe(true);
  });

  it('uses Windows and WSL-accessible home templates', () => {
    const windows = knownClientLocationsForPlatform('windows', {
      home: String.raw`C:\Users\alice`,
      windowsHome: String.raw`C:\Users\alice`,
      appData: String.raw`C:\Users\alice\AppData\Roaming`
    });
    const wsl = knownClientLocationsForPlatform('wsl', {
      home: '/home/alice',
      distro: 'Ubuntu',
      wslUser: 'alice'
    });

    expect(windows.some((location) => location.path?.includes(String.raw`C:\Users\alice`))).toBe(true);
    expect(windows.some((location) => location.path?.includes(String.raw`AppData\Roaming`))).toBe(true);
    expect(wsl.some((location) => location.path?.startsWith(String.raw`\\wsl.localhost\Ubuntu\home\alice`))).toBe(true);
  });
});
