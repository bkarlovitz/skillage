import type { CapabilityResource } from './inventory/types';

export function findCapabilityResourceById(items: CapabilityResource[], id: string): CapabilityResource | undefined {
  if (!id) return undefined;
  return items.find((item) => item.id === id);
}
