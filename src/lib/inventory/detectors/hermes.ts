import type { DetectorFile, DetectorResult } from './common';
import {
  comparablePath,
  emptyDetectorResult,
  evidence,
  normalizePath,
  resource,
  stableId
} from './common';

const client = 'hermes' as const;

function segments(path: string): string[] {
  return normalizePath(path).split('/').filter(Boolean);
}

function hermesIndex(path: string): number {
  return segments(path).findIndex((part) => part.toLowerCase() === '.hermes');
}

function isHermesFile(file: DetectorFile): boolean {
  return comparablePath(file.path).includes('/.hermes/');
}

function profileNameForPath(path: string): string | undefined {
  const parts = segments(path);
  const index = hermesIndex(path);
  if (index < 0) return undefined;

  if (parts[index + 1]?.toLowerCase() === 'profiles' && parts[index + 2]) {
    return parts[index + 2];
  }

  if (parts[index + 1]?.toLowerCase() === 'config.yaml' || parts[index + 1]?.toLowerCase() === 'config.yml') {
    return 'default';
  }

  return undefined;
}

function profileRootForPath(path: string, profileName: string): string {
  const parts = segments(path);
  const index = hermesIndex(path);
  const prefix = parts.slice(0, index + 1).join('/');
  return `${path.startsWith('/') ? '/' : ''}${prefix}/profiles/${profileName}`;
}

export function detectHermes(files: DetectorFile[]): DetectorResult {
  const result = emptyDetectorResult();
  const profiles = new Map<string, { name: string; path: string; sourcePath: string }>();

  for (const file of files.filter(isHermesFile)) {
    const profileName = profileNameForPath(file.path);
    if (!profileName) continue;
    const profilePath = profileRootForPath(file.path, profileName);
    profiles.set(profileName, { name: profileName, path: profilePath, sourcePath: file.path });
  }

  for (const profile of Array.from(profiles.values()).sort((a, b) => a.name.localeCompare(b.name))) {
    const profileEvidence = evidence({
      path: profile.sourcePath,
      sourceLabel: profile.path,
      scannerRule: 'hermes-profile',
      matchedPathPattern: '~/.hermes/profiles/*'
    });

    result.resources.push(resource({
      id: `${client}:profile:${stableId(profile.name)}`,
      name: profile.name,
      description: `Hermes ${profile.name} profile environment.`,
      client,
      resourceType: 'profile',
      scope: 'profile',
      status: 'found',
      path: profile.path,
      evidence: [profileEvidence],
      tags: ['profile'],
      metadata: {
        profileName: profile.name,
        mergedAcrossProfiles: false
      }
    }));
  }

  return result;
}
