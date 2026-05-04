import type { CapabilityResource } from './types';

export const unknownSourceLocation = 'unknown source';

export interface SourceClarity {
  sourceLocation: string;
  known: boolean;
}

function usable(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function sourceLocationForResource(resource: CapabilityResource): string {
  return usable(resource.path)
    ?? resource.evidence.map((item) => usable(item.sourcePath) ?? usable(item.sourceLabel)).find(Boolean)
    ?? unknownSourceLocation;
}

export function sourceClarityForResource(resource: CapabilityResource): SourceClarity {
  const sourceLocation = sourceLocationForResource(resource);
  return {
    sourceLocation,
    known: sourceLocation !== unknownSourceLocation
  };
}

export function sourceLocationsForResources(resources: CapabilityResource[]): string[] {
  const locations = Array.from(new Set(resources.map(sourceLocationForResource)));
  return locations.length ? locations.sort() : [unknownSourceLocation];
}
