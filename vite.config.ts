import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
    || basename === 'hooks.json'
    || basename === 'openclaw.json'
    || (basename === 'config.toml' && lower.includes('/.codex/'))
    || (normalized.includes('/.cursor/rules/') && (basename.endsWith('.mdc') || basename.endsWith('.md')))
    || (normalized.includes('/.openclaw/') && basename.endsWith('.md'))
    || (normalized.includes('/.claude/rules/') && basename.endsWith('.md'))
    || (normalized.includes('/.codex/rules/') && basename.endsWith('.rules'));
}

function scanRoot(root: string): VirtualFile[] {
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

function standardRoots(): string[] {
  const home = os.homedir();
  return [
    path.join(home, '.claude'),
    path.join(home, '.hermes', 'skills'),
    path.join(home, '.hermes', 'hermes-agent', 'skills'),
    path.join(home, '.hermes', 'hermes-agent', 'optional-skills'),
    path.join(home, '.codex'),
    path.join(home, '.agents'),
    path.join(home, '.openclaw'),
    '/etc/codex',
    process.cwd()
  ].filter((candidate, index, all) => fs.existsSync(candidate) && all.indexOf(candidate) === index);
}

function skillageDevScanner(): Plugin {
  return {
    name: 'skillage-dev-scanner',
    configureServer(server) {
      server.middlewares.use('/api/scan-standard', (_req, res) => {
        const files = standardRoots().flatMap(scanRoot);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(files));
      });

      server.middlewares.use('/api/scan-root', (req, res) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        const root = url.searchParams.get('root');
        const files = root ? scanRoot(root) : [];
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(files));
      });
    }
  };
}

export default defineConfig({
  plugins: [svelte(), skillageDevScanner()]
});
