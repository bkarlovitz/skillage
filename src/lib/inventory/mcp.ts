import { defaultPreviewPolicy } from './preview';
import type { ParsedJsonConfig, JsonObject, JsonValue } from './config/json';
import { evidenceForJsonPath, jsonValueIsObject } from './config/json';
import type { ParsedTomlConfig } from './config/toml';
import { evidenceForTomlPath } from './config/toml';
import type {
  CapabilityClient,
  CapabilityEvidence,
  CapabilityResource,
  CapabilityScope,
  CapabilityWarning
} from './types';

export type ParsedConfigDocument = ParsedJsonConfig | ParsedTomlConfig;

export interface McpExtractionInput {
  client: CapabilityClient;
  scope: CapabilityScope;
  configPath: string;
  document: ParsedConfigDocument;
  scannerRule?: string;
  containerPaths?: Array<readonly string[]>;
  trustGated?: boolean;
}

export interface McpServerEntry {
  name: string;
  value: JsonObject;
  containerPath: string[];
  evidence: CapabilityEvidence;
}

const defaultContainerPaths: Array<readonly string[]> = [
  ['mcpServers'],
  ['mcp_servers'],
  ['mcp', 'servers'],
  ['servers']
];

function stableId(input: string): string {
  return input.replace(/[^a-zA-Z0-9:_./-]/g, '-');
}

function keyPathToString(path: readonly string[]): string {
  return path.join('.');
}

function valueAtPath(value: JsonValue | undefined, path: readonly string[]): JsonValue | undefined {
  let current = value;

  for (const part of path) {
    if (Array.isArray(current)) {
      const index = Number(part);
      current = Number.isInteger(index) ? current[index] : undefined;
    } else if (jsonValueIsObject(current)) {
      current = current[part];
    } else {
      current = undefined;
    }

    if (current === undefined) return undefined;
  }

  return current;
}

function evidenceForDocumentPath(document: ParsedConfigDocument, keyPath: readonly string[]): CapabilityEvidence {
  return document.format === 'json'
    ? evidenceForJsonPath(document, keyPath)
    : evidenceForTomlPath(document, keyPath);
}

function stringAt(object: JsonObject, key: string): string | undefined {
  const value = object[key];
  return typeof value === 'string' ? value : undefined;
}

function stringArrayAt(object: JsonObject, key: string): string[] {
  const value = object[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function envVarNames(value: JsonValue | undefined): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (jsonValueIsObject(value)) return Object.keys(value);
  return [];
}

function packageFromCommand(command: string | undefined, args: string[]): string | undefined {
  const runnerCommands = new Set(['npx', 'pnpx', 'yarn', 'pnpm', 'bunx', 'uvx']);
  if (!command || !runnerCommands.has(command)) return undefined;
  return args.find((arg) => !arg.startsWith('-'));
}

function mcpWarning(message: string, evidence: CapabilityEvidence, severity: CapabilityWarning['severity'] = 'info'): CapabilityWarning {
  return {
    kind: severity === 'error' ? 'parse-read-problem' : 'runtime-caveat',
    severity,
    message,
    evidence
  };
}

function mcpResourceFromEntry(input: McpExtractionInput, entry: McpServerEntry): CapabilityResource {
  const command = stringAt(entry.value, 'command');
  const args = stringArrayAt(entry.value, 'args');
  const url = stringAt(entry.value, 'url') ?? stringAt(entry.value, 'endpoint');
  const packageHint = stringAt(entry.value, 'package') ?? stringAt(entry.value, 'module') ?? packageFromCommand(command, args);
  const envVars = envVarNames(entry.value.env);
  const statuses = input.trustGated ? ['found', 'not-tested', 'needs-review'] as const : ['found', 'not-tested'] as const;
  const warnings: CapabilityWarning[] = [
    mcpWarning('MCP server is configured but was not started or connectivity-tested.', entry.evidence)
  ];

  if (!command && !url && !packageHint) {
    warnings.push(mcpWarning('MCP server definition does not expose a command, package, or URL hint.', entry.evidence, 'warning'));
  }
  if (input.trustGated) {
    warnings.push(mcpWarning('Project-scoped MCP activation depends on client trust state and needs review.', entry.evidence, 'warning'));
  }

  return {
    id: `mcp:${stableId(input.client)}:${stableId(input.scope)}:${stableId(input.configPath)}:${stableId(entry.name)}`,
    name: entry.name,
    description: `${input.client} MCP server configured in ${input.configPath}.`,
    client: input.client,
    resourceType: 'mcp-server',
    scope: input.scope,
    status: input.trustGated ? 'needs-review' : 'not-tested',
    statuses: [...statuses],
    previewPolicy: defaultPreviewPolicy({ resourceType: 'mcp-server', path: input.configPath, name: entry.name }),
    path: input.configPath,
    evidence: [entry.evidence],
    warnings,
    relationships: [],
    tags: ['mcp'],
    metadata: {
      configured: true,
      tested: false,
      command: command ?? '',
      package: packageHint ?? '',
      url: url ?? '',
      args,
      envVars,
      sourceKeyPath: entry.evidence.parsedKeyPath ?? keyPathToString(entry.containerPath),
      launchKind: url ? 'remote-url' : command ? 'command' : packageHint ? 'package' : 'unknown'
    }
  };
}

export function extractMcpServerEntries(document: ParsedConfigDocument, containerPaths: Array<readonly string[]> = defaultContainerPaths): McpServerEntry[] {
  if (!document.value) return [];
  const entries: McpServerEntry[] = [];
  const seen = new Set<string>();

  for (const containerPath of containerPaths) {
    const container = valueAtPath(document.value, containerPath);
    if (!jsonValueIsObject(container)) continue;

    for (const [name, value] of Object.entries(container)) {
      if (!jsonValueIsObject(value)) continue;
      const entryPath = [...containerPath, name];
      const key = keyPathToString(entryPath);
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({
        name,
        value,
        containerPath: [...containerPath],
        evidence: evidenceForDocumentPath(document, entryPath)
      });
    }
  }

  return entries;
}

export function extractMcpServersFromConfig(input: McpExtractionInput): CapabilityResource[] {
  return extractMcpServerEntries(input.document, input.containerPaths).map((entry) => mcpResourceFromEntry(input, entry));
}
