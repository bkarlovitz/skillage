import type { CapabilityResource, CapabilityStatus } from '../types';

export interface ProjectActivationData {
  states: CapabilityStatus[];
  confidence: CapabilityStatus;
  caveats: string[];
  activeEvidence: boolean;
}

const orderedStates: CapabilityStatus[] = [
  'found',
  'active',
  'likely-active',
  'inherited',
  'unknown',
  'needs-review',
  'not-tested',
  'trust-gated',
  'disabled',
  'blocked',
  'shadowed',
  'overridden'
];

function uniqueStates(states: CapabilityStatus[]): CapabilityStatus[] {
  return Array.from(new Set(states)).sort((a, b) => {
    const left = orderedStates.indexOf(a);
    const right = orderedStates.indexOf(b);
    return (left < 0 ? orderedStates.length : left) - (right < 0 ? orderedStates.length : right);
  });
}

function metadataStates(resource: CapabilityResource): CapabilityStatus[] {
  const value = resource.metadata.activationStates;
  const states = Array.isArray(value)
    ? value.filter((item): item is CapabilityStatus => orderedStates.includes(item as CapabilityStatus))
    : [];
  const confidence = resource.metadata.activationConfidence;
  if (typeof confidence === 'string' && orderedStates.includes(confidence as CapabilityStatus)) states.push(confidence as CapabilityStatus);
  return states;
}

function inferredStates(resource: CapabilityResource): CapabilityStatus[] {
  const states: CapabilityStatus[] = [resource.status, ...(resource.statuses ?? []), ...metadataStates(resource)];

  if (resource.metadata.inherited === true) states.push('inherited');
  if (resource.metadata.projectLayer === 'trust-gated' || resource.metadata.trustGated === true) states.push('trust-gated', 'needs-review');
  if (resource.resourceType === 'mcp-server' && resource.metadata.tested === false) states.push('not-tested');
  if (resource.status === 'found' && resource.scope === 'project-shared') states.push('unknown');

  return uniqueStates(states);
}

function activationCaveats(resource: CapabilityResource, states: CapabilityStatus[]): string[] {
  const caveats = [
    ...resource.warnings.map((warning) => warning.message),
    ...(Array.isArray(resource.metadata.inheritanceCaveats) ? resource.metadata.inheritanceCaveats.map(String) : []),
    ...(Array.isArray(resource.metadata.activationCaveats) ? resource.metadata.activationCaveats.map(String) : [])
  ];

  if (states.includes('trust-gated')) caveats.push('Activation is trust-gated and must not be treated as active without explicit trust evidence.');
  if (states.includes('not-tested')) caveats.push('Configured resource was not runtime-tested.');
  if (states.includes('unknown')) caveats.push('Activation could not be proven from static inventory evidence.');

  return Array.from(new Set(caveats));
}

function confidenceFor(states: CapabilityStatus[]): CapabilityStatus {
  if (states.includes('active')) return 'active';
  if (states.includes('likely-active')) return 'likely-active';
  if (states.includes('inherited')) return 'inherited';
  if (states.includes('trust-gated')) return 'trust-gated';
  if (states.includes('needs-review')) return 'needs-review';
  if (states.includes('not-tested')) return 'not-tested';
  if (states.includes('found')) return 'found';
  return 'unknown';
}

export function projectActivationData(resource: CapabilityResource): ProjectActivationData {
  const states = inferredStates(resource);
  return {
    states,
    confidence: confidenceFor(states),
    caveats: activationCaveats(resource, states),
    activeEvidence: states.includes('active')
  };
}

export function withProjectActivationData(resource: CapabilityResource): CapabilityResource {
  const activation = projectActivationData(resource);
  return {
    ...resource,
    statuses: uniqueStates([resource.status, ...(resource.statuses ?? []), ...activation.states]),
    metadata: {
      ...resource.metadata,
      activationStates: activation.states,
      activationConfidence: activation.confidence,
      activationCaveats: activation.caveats,
      activeEvidence: activation.activeEvidence
    }
  };
}
