import { applyProjectGlobalShadowing } from '../shadowingAnalysis';
import type { CapabilityResource, CapabilityStatus } from '../types';
import { projectActivationData, withProjectActivationData } from './activation';

const inventoryRelationshipStatuses: CapabilityStatus[] = [
  'inherited',
  'likely-active',
  'needs-review',
  'shadowed',
  'overridden'
];

const effectiveStates: CapabilityStatus[] = [
  'active',
  'likely-active',
  'inherited',
  'trust-gated',
  'needs-review',
  'not-tested',
  'found',
  'shadowed',
  'overridden'
];

function statuses(resource: CapabilityResource): CapabilityStatus[] {
  return [resource.status, ...(resource.statuses ?? [])];
}

function hasAnyStatus(resource: CapabilityResource, candidates: CapabilityStatus[]): boolean {
  const values = statuses(resource);
  return candidates.some((status) => values.includes(status));
}

function belongsToProjectInventory(resource: CapabilityResource): boolean {
  return resource.scope === 'project-shared'
    || resource.scope === 'local-private'
    || hasAnyStatus(resource, inventoryRelationshipStatuses);
}

export function buildProjectRelationshipResources(resources: CapabilityResource[]): CapabilityResource[] {
  return applyProjectGlobalShadowing(resources);
}

export function buildProjectInventoryResources(resources: CapabilityResource[]): CapabilityResource[] {
  return buildProjectRelationshipResources(resources)
    .map(withProjectActivationData)
    .filter(belongsToProjectInventory);
}

export function buildProjectEffectiveResources(resources: CapabilityResource[]): CapabilityResource[] {
  return buildProjectInventoryResources(resources).filter((resource) => {
    const activation = projectActivationData(resource);
    return activation.states.some((state) => effectiveStates.includes(state));
  });
}
