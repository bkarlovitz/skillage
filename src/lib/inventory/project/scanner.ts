import { detectCoreClients } from '../detectors';
import type { DetectorFile } from '../detectors/common';
import { evidence, resource, stableId } from '../detectors/common';
import { defaultPreviewPolicy } from '../preview';
import { createEmptyScanSummary, type ScanSummary, type SelectedProjectContext, type SkippedSensitiveStore } from '../scan';
import type { CapabilityClient, CapabilityResource } from '../types';
import { withProjectActivationData } from './activation';
import { classifyGitFileState, gitFileMetadata, withGitMetadata } from './git';
import type { GitCommandRunner } from './context';
import { classifyProjectPathScope } from './scope';

export interface ProjectInventoryScanInput {
  context: SelectedProjectContext;
  files: DetectorFile[];
  generatedAt?: string;
  runGit?: GitCommandRunner;
}

function clientForProjectPath(path: string): CapabilityClient {
  const normalized = path.replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/.cursor/')) return 'cursor';
  if (normalized.includes('/.codex/') || normalized.includes('/.agents/') || normalized.endsWith('/agents.md')) return 'codex';
  if (normalized.includes('/.hermes/')) return 'hermes';
  if (normalized.includes('/.openclaw/')) return 'openclaw';
  return 'claude-code';
}

function safeStoreType(file: DetectorFile): 'sensitive-store' | 'log-session-store' | undefined {
  const policy = defaultPreviewPolicy({ resourceType: 'config-file', path: file.path });
  if (policy === 'unread-sensitive') return 'sensitive-store';
  if (policy === 'metadata-only') return 'log-session-store';
  return undefined;
}

function safeProjectStoreResources(files: DetectorFile[], context: SelectedProjectContext, existingPaths: Set<string>): {
  resources: CapabilityResource[];
  skipped: SkippedSensitiveStore[];
} {
  const resources: CapabilityResource[] = [];
  const skipped: SkippedSensitiveStore[] = [];

  for (const file of files) {
    if (existingPaths.has(file.path)) continue;
    const resourceType = safeStoreType(file);
    if (!resourceType) continue;

    const classification = classifyProjectPathScope(file.path, context);
    if (!classification.withinProject) continue;

    const client = clientForProjectPath(file.path);
    const sourceEvidence = evidence({
      path: file.path,
      scannerRule: resourceType === 'sensitive-store' ? 'project-sensitive-store' : 'project-log-session-store',
      matchedPathPattern: resourceType === 'sensitive-store' ? 'project credential/token/auth store' : 'project log/session/cache store',
      readStatus: 'skipped',
      parseStatus: 'skipped'
    });
    const contentPreview = {
      policy: resourceType === 'sensitive-store' ? 'unread-sensitive' as const : 'metadata-only' as const,
      rawPreviewAllowed: false,
      reason: 'Project sensitive/log/session content is represented as metadata only.'
    };

    resources.push(resource({
      id: `project:${resourceType}:${stableId(file.path)}`,
      name: resourceType === 'sensitive-store' ? 'Project sensitive store' : 'Project log/session store',
      description: resourceType === 'sensitive-store'
        ? 'Project credential/token/auth store presence. Content is not read for inventory.'
        : 'Project log/session/cache store presence. Content is not read for inventory.',
      client,
      resourceType,
      scope: classification.scope === 'unknown' ? 'local-private' : classification.scope,
      status: resourceType === 'sensitive-store' ? 'sensitive' : 'found',
      path: file.path,
      evidence: [sourceEvidence],
      warnings: [{
        kind: 'secret-auth-concern',
        severity: 'info',
        message: 'Project store content is represented as metadata only.',
        evidence: sourceEvidence
      }],
      tags: resourceType === 'sensitive-store' ? ['sensitive'] : ['logs', 'sessions'],
      contentPreview
    }));

    skipped.push({
      id: `skip:${stableId(file.path)}`,
      client,
      resourceType,
      scope: classification.scope === 'unknown' ? 'local-private' : classification.scope,
      path: file.path,
      reason: 'Project sensitive/log/session content is represented as metadata only.',
      evidence: sourceEvidence
    });
  }

  return { resources, skipped };
}

async function attachGitMetadata(resources: CapabilityResource[], context: SelectedProjectContext, runGit?: GitCommandRunner): Promise<CapabilityResource[]> {
  if (!runGit) return resources;

  return Promise.all(resources.map(async (item) => {
    if (!item.path || (item.scope !== 'project-shared' && item.scope !== 'local-private')) return item;
    const state = await classifyGitFileState(item.path, context, runGit);
    return withGitMetadata(item, gitFileMetadata(state));
  }));
}

export async function scanProjectInventory(input: ProjectInventoryScanInput): Promise<ScanSummary> {
  const detected = detectCoreClients(input.files, { projectContext: input.context });
  const existingPaths = new Set(detected.resources
    .filter((item) => item.resourceType === 'sensitive-store' || item.resourceType === 'log-session-store')
    .map((item) => item.path)
    .filter((path): path is string => Boolean(path)));
  const safeStores = safeProjectStoreResources(input.files, input.context, existingPaths);
  const syntheticStorePaths = new Set(safeStores.resources.map((item) => item.path).filter((path): path is string => Boolean(path)));
  const detectorResources = detected.resources.filter((item) => !(item.path && syntheticStorePaths.has(item.path) && item.resourceType === 'config-file'));
  const resources = (await attachGitMetadata([...detectorResources, ...safeStores.resources], input.context, input.runGit))
    .map(withProjectActivationData);

  return createEmptyScanSummary({
    id: 'project-inventory-scan',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    dataSource: 'local-scan',
    resources,
    selectedProject: input.context,
    scanRoots: [{
      path: input.context.scanRootPath,
      label: 'Selected project scan root',
      status: 'scanned',
      scope: 'project-shared',
      evidence: {
        sourcePath: input.context.scanRootPath,
        sourceLabel: 'Selected project scan root',
        scannerRule: 'project-inventory',
        matchedPathPattern: input.context.scanRootPath,
        readStatus: 'read',
        parseStatus: 'not-applicable'
      }
    }],
    readErrors: detected.readErrors,
    parseErrors: detected.parseErrors,
    skippedSensitiveStores: [...detected.skippedSensitiveStores, ...safeStores.skipped],
    warnings: detected.warnings
  });
}
