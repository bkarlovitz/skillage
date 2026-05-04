import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseVirtualFiles } from './src/lib/adapters';
import { coreInventoryClients } from './src/lib/inventory/clientSummary';
import { detectCoreClients } from './src/lib/inventory/detectors';
import { capabilityResourcesFromSkillItems } from './src/lib/inventory/legacy';
import { buildLocalScanResult } from './src/lib/inventory/localScan';
import { knownClientLocationsForPlatform, type OsFamily } from './src/lib/inventory/locations';
import type { ScanSummary } from './src/lib/inventory/scan';

const MAX_FILES = 2_000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_DEPTH = 14;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'target', '.next', '.svelte-kit', 'vendor']);

interface VirtualFile {
  path: string;
  content: string;
}

function isInteresting(filePath: string): boolean {
  const normalized = filePath.replaceAll(path.sep, '/');
  const lower = normalized.toLowerCase();
  const basename = path.basename(filePath);
  return basename === 'SKILL.md'
    || basename === 'CLAUDE.md'
    || basename === 'CLAUDE.local.md'
    || basename === 'AGENTS.md'
    || basename === 'AGENTS.override.md'
    || basename === 'SOUL.md'
    || basename === 'TOOLS.md'
    || basename === 'MEMORY.md'
    || basename === '.cursorrules'
    || basename === 'claude_desktop_config.json'
    || basename === 'hooks.json'
    || basename === 'openclaw.json'
    || ((basename === 'settings.json' || basename === 'settings.local.json' || basename === 'mcp.json') && (lower.includes('/.claude/') || lower.includes('/.cursor/')))
    || ((basename === 'config.yaml' || basename === 'config.yml' || basename === 'config.json' || basename === 'mcp.json') && lower.includes('/.hermes/'))
    || (basename === 'config.toml' && (lower.includes('/.codex/') || lower.includes('/etc/codex/')))
    || ((basename === 'config.json' || basename === 'openclaw.json') && lower.includes('/.openclaw/'))
    || (normalized.includes('/.claude/commands/') && basename.endsWith('.md'))
    || (normalized.includes('/.claude/agents/') && basename.endsWith('.md'))
    || (normalized.includes('/.codex/agents/') && basename.endsWith('.toml'))
    || (normalized.includes('/.agents/') && (basename === 'SKILL.md' || basename === 'plugin.json' || basename === 'marketplace.json'))
    || (normalized.includes('/.cursor/rules/') && (basename.endsWith('.mdc') || basename.endsWith('.md')))
    || (normalized.includes('/.hermes/profiles/') && basename === 'SKILL.md')
    || (normalized.includes('/.hermes/hermes-agent/') && basename === 'SKILL.md')
    || (normalized.includes('/.openclaw/') && basename.endsWith('.md'))
    || (normalized.includes('/.claude/rules/') && basename.endsWith('.md'))
    || (normalized.includes('/.codex/rules/') && basename.endsWith('.rules'));
}

function scanRootFiles(root: string): VirtualFile[] {
  const resolved = path.resolve(root.replace(/^~(?=$|\/)/, os.homedir()));
  const files: VirtualFile[] = [];

  function walk(current: string, depth: number) {
    if (files.length >= MAX_FILES || depth > MAX_DEPTH) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;
      const child = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(child, depth + 1);
        continue;
      }
      if (!entry.isFile() || !isInteresting(child)) continue;

      try {
        const stat = fs.statSync(child);
        if (stat.size > MAX_FILE_BYTES) continue;
        files.push({ path: child, content: fs.readFileSync(child, 'utf8') });
      } catch {
        // Unreadable files are ignored in the dev helper. The production Tauri path should return warnings.
      }
    }
  }

  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) walk(resolved, 0);
  return files;
}

export function standardRootCandidates(home = os.homedir(), appData = process.env.APPDATA): string[] {
  const roots = [
    path.join(home, '.claude'),
    path.join(home, '.config', 'Claude'),
    path.join(home, 'Library', 'Application Support', 'Claude'),
    path.join(home, '.hermes'),
    path.join(home, '.hermes', 'profiles'),
    path.join(home, '.hermes', 'skills'),
    path.join(home, '.hermes', 'hermes-agent', 'skills'),
    path.join(home, '.hermes', 'hermes-agent', 'optional-skills'),
    path.join(home, '.codex'),
    path.join(home, '.agents'),
    path.join(home, '.cursor'),
    path.join(home, '.config', 'Cursor', 'User'),
    path.join(home, 'Library', 'Application Support', 'Cursor', 'User'),
    path.join(home, '.openclaw'),
    '/etc/codex',
    process.cwd()
  ];

  if (appData) {
    roots.push(path.join(appData, 'Claude'));
    roots.push(path.join(appData, 'Cursor', 'User'));
  }

  return roots;
}

export function standardRoots(): string[] {
  return [
    ...standardRootCandidates()
  ].filter((candidate, index, all) => fs.existsSync(candidate) && all.indexOf(candidate) === index);
}

function currentOsFamily(): OsFamily {
  if (process.platform === 'darwin') return 'macos';
  if (process.platform === 'win32') return 'windows';
  return 'linux';
}

function knownLocationsForDev(existingPaths: string[]): ReturnType<typeof knownClientLocationsForPlatform> {
  return knownClientLocationsForPlatform(currentOsFamily(), {
    home: os.homedir(),
    windowsHome: os.homedir(),
    appData: process.env.APPDATA
  }, existingPaths);
}

export function virtualFilesToDevScanSummary(files: VirtualFile[], kind: 'standard' | 'root', root = ''): ScanSummary {
  const coreResult = detectCoreClients(files);
  const coreClients = new Set<string>(coreInventoryClients);
  const legacyResources = capabilityResourcesFromSkillItems(parseVirtualFiles(files)).filter((resource) => !coreClients.has(resource.client));
  const resources = [...coreResult.resources, ...legacyResources];
  const result = buildLocalScanResult({
    scanId: kind === 'standard' ? 'local-standard-scan' : 'local-root-scan',
    rootPath: kind === 'standard' ? 'standard locations' : root,
    rootLabel: kind === 'standard' ? 'Standard local locations' : 'Selected scan root',
    scannerRule: kind === 'standard' ? 'standard-locations' : 'selected-root',
    matchedPathPattern: kind === 'standard' ? 'known client homes and current working directory' : root,
    dataSourceLabel: kind === 'standard' ? 'Local scan: standard locations' : `Local scan: ${root}`,
    resources,
    loadedStatus: '',
    emptyStatus: ''
  }).summary;

  result.readErrors = coreResult.readErrors;
  result.parseErrors = coreResult.parseErrors;
  result.skippedSensitiveStores = coreResult.skippedSensitiveStores;
  result.warnings = coreResult.warnings;
  return result;
}

export function scanRoot(root: string): ScanSummary {
  const summary = virtualFilesToDevScanSummary(scanRootFiles(root), 'root', root);
  summary.knownClientLocations = knownLocationsForDev(standardRoots());
  return summary;
}

export function scanStandardRoots(): ScanSummary {
  const roots = standardRoots();
  const files = roots.flatMap(scanRootFiles);
  const summary = virtualFilesToDevScanSummary(files, 'standard');
  summary.knownClientLocations = knownLocationsForDev(roots);
  return summary;
}

function skillageDevScanner(): Plugin {
  return {
    name: 'skillage-dev-scanner',
    configureServer(server) {
      server.middlewares.use('/api/scan-standard', (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(scanStandardRoots()));
      });

      server.middlewares.use('/api/scan-root', (req, res) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        const root = url.searchParams.get('root');
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(root ? scanRoot(root) : virtualFilesToDevScanSummary([], 'root', '')));
      });
    }
  };
}

export default defineConfig({
  plugins: [svelte(), skillageDevScanner()]
});
