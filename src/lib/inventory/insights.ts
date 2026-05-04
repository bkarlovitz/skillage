import type { RelationshipInference } from './relationships';
import type { ScanSummary } from './scan';
import type { CapabilityClient, CapabilityWarningKind, CapabilityWarningSeverity } from './types';

export const insightCategories = [
  'parse-read-problem',
  'scope-concern',
  'duplication-conflict',
  'secret-auth-concern',
  'runtime-caveat'
] as const satisfies readonly CapabilityWarningKind[];

export type InsightCategory = typeof insightCategories[number];

export type InsightSource =
  | 'resource-warning'
  | 'read-error'
  | 'parse-error'
  | 'skipped-sensitive-store'
  | 'scanner-warning'
  | 'relationship-analysis';

export interface InventoryInsight {
  id: string;
  category: InsightCategory;
  severity: CapabilityWarningSeverity;
  title: string;
  message: string;
  source: InsightSource;
  client?: CapabilityClient;
  resourceId?: string;
  path?: string;
}

function stableId(value: string): string {
  return value.replace(/[^a-zA-Z0-9:_./-]/g, '-');
}

function titleFor(category: InsightCategory): string {
  if (category === 'parse-read-problem') return 'Parse/Read Problem';
  if (category === 'scope-concern') return 'Scope Concern';
  if (category === 'duplication-conflict') return 'Duplication/Conflict';
  if (category === 'secret-auth-concern') return 'Secret/Auth Concern';
  return 'Runtime Caveat';
}

function categoryFromMessage(message: string): InsightCategory {
  const value = message.toLowerCase();
  if (value.includes('parse') || value.includes('read') || value.includes('missing') || value.includes('unreadable')) return 'parse-read-problem';
  if (value.includes('secret') || value.includes('auth') || value.includes('token') || value.includes('credential')) return 'secret-auth-concern';
  if (value.includes('duplicate') || value.includes('conflict') || value.includes('shadow') || value.includes('override') || value.includes('same-name')) return 'duplication-conflict';
  if (value.includes('scope') || value.includes('trust') || value.includes('profile') || value.includes('local/private') || value.includes('collaborator')) return 'scope-concern';
  return 'runtime-caveat';
}

function relationshipSeverity(relationship: RelationshipInference): CapabilityWarningSeverity {
  if (relationship.label === 'conflict') return 'warning';
  if (relationship.label === 'needs-review') return 'warning';
  return 'info';
}

function relationshipMessage(relationship: RelationshipInference): string {
  return `${relationship.label}: ${relationship.note}`;
}

export function buildInventoryInsights(summary: ScanSummary, relationships: RelationshipInference[] = []): InventoryInsight[] {
  const resourceWarnings = summary.resources.flatMap((resource) => resource.warnings.map((warning, index): InventoryInsight => ({
    id: `resource:${resource.id}:${index}`,
    category: warning.kind,
    severity: warning.severity,
    title: titleFor(warning.kind),
    message: warning.message,
    source: 'resource-warning',
    client: resource.client,
    resourceId: resource.id,
    path: resource.path ?? warning.evidence?.sourcePath
  })));
  const readErrors = summary.readErrors.map((error): InventoryInsight => ({
    id: `read:${error.id}`,
    category: 'parse-read-problem',
    severity: 'error',
    title: titleFor('parse-read-problem'),
    message: error.message,
    source: 'read-error',
    client: error.client,
    path: error.path
  }));
  const parseErrors = summary.parseErrors.map((error): InventoryInsight => ({
    id: `parse:${error.id}`,
    category: 'parse-read-problem',
    severity: 'error',
    title: titleFor('parse-read-problem'),
    message: error.message,
    source: 'parse-error',
    client: error.client,
    path: error.path
  }));
  const skippedStores = summary.skippedSensitiveStores.map((store): InventoryInsight => ({
    id: `skipped:${store.id}`,
    category: 'secret-auth-concern',
    severity: 'warning',
    title: titleFor('secret-auth-concern'),
    message: store.reason,
    source: 'skipped-sensitive-store',
    client: store.client,
    path: store.path
  }));
  const scannerWarnings = summary.warnings.map((warning): InventoryInsight => {
    const category = categoryFromMessage(warning.message);
    return {
      id: `scanner:${warning.id}`,
      category,
      severity: warning.severity,
      title: titleFor(category),
      message: warning.message,
      source: 'scanner-warning',
      client: warning.client,
      path: warning.evidence?.sourcePath ?? warning.evidence?.sourceLabel
    };
  });
  const relationshipInsights = relationships
    .filter((relationship) => relationship.label !== 'no-relationship-inferred')
    .map((relationship): InventoryInsight => ({
      id: `relationship:${stableId(`${relationship.sourceResourceId ?? 'unknown'}:${relationship.targetResourceId ?? 'unknown'}:${relationship.label}`)}`,
      category: 'duplication-conflict',
      severity: relationshipSeverity(relationship),
      title: titleFor('duplication-conflict'),
      message: relationshipMessage(relationship),
      source: 'relationship-analysis',
      resourceId: relationship.sourceResourceId
    }));

  return [
    ...resourceWarnings,
    ...readErrors,
    ...parseErrors,
    ...skippedStores,
    ...scannerWarnings,
    ...relationshipInsights
  ];
}

export function insightCounts(insights: InventoryInsight[]): Record<InsightCategory, number> {
  return insightCategories.reduce<Record<InsightCategory, number>>((counts, category) => {
    counts[category] = insights.filter((insight) => insight.category === category).length;
    return counts;
  }, {
    'parse-read-problem': 0,
    'scope-concern': 0,
    'duplication-conflict': 0,
    'secret-auth-concern': 0,
    'runtime-caveat': 0
  });
}
