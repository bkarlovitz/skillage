import type { SkillKind, SkillOrigin, SkillScope, SkillTarget } from './types';

export interface Classification {
  target: SkillTarget;
  source: SkillTarget;
  kind: SkillKind;
  scope: SkillScope;
  origin: SkillOrigin;
  category?: string;
  container?: string;
  entryFile?: string;
}

const INSTRUCTION_FILES = new Set(['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', 'AGENTS.override.md', 'SOUL.md', 'TOOLS.md']);
const MEMORY_FILES = new Set(['MEMORY.md']);

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/\/+/g, '/');
}

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

function segments(path: string): string[] {
  return normalizePath(path).split('/').filter(Boolean);
}

function segmentAfter(parts: string[], marker: string): string | undefined {
  const index = parts.indexOf(marker);
  return index >= 0 ? parts[index + 1] : undefined;
}

function skillCategory(parts: string[], marker: string): string | undefined {
  const index = parts.indexOf(marker);
  if (index < 0) return undefined;
  const between = parts.slice(index + 1, -1);
  return between.length > 1 ? between[0] : undefined;
}

function pluginContainer(parts: string[], skillsIndex: number): string | undefined {
  if (skillsIndex <= 0) return undefined;
  if (parts[skillsIndex - 1] === 'plugins') return parts[skillsIndex];
  return parts[skillsIndex - 1];
}

function claudePluginContainer(parts: string[], lowerParts: string[], claudeIndex: number, skillsIndex: number): string | undefined {
  const cacheIndex = lowerParts.indexOf('cache', claudeIndex + 1);
  if (cacheIndex >= 0) return parts[cacheIndex + 2] ?? pluginContainer(parts, skillsIndex);
  const pluginsIndex = lowerParts.indexOf('plugins', claudeIndex + 2);
  if (pluginsIndex >= 0 && pluginsIndex < skillsIndex) return parts[pluginsIndex + 1] ?? pluginContainer(parts, skillsIndex);
  return pluginContainer(parts, skillsIndex);
}

function isHomeRelative(path: string): boolean {
  return path.startsWith('~/');
}

function isUserHomePath(parts: string[]): boolean {
  const lowerParts = parts.map((part) => part.toLowerCase());
  const homeIndex = lowerParts.indexOf('home');
  if (homeIndex >= 0 && parts.length > homeIndex + 1) return true;
  const usersIndex = lowerParts.indexOf('users');
  return usersIndex >= 0 && parts.length > usersIndex + 1;
}

function globalOrProject(path: string, parts: string[]): { scope: SkillScope; origin: SkillOrigin } {
  if (isHomeRelative(path) || isUserHomePath(parts)) return { scope: 'global', origin: 'user' };
  return { scope: 'project', origin: 'project' };
}

function make(target: SkillTarget, kind: SkillKind, scope: SkillScope, origin: SkillOrigin, extra: Partial<Classification> = {}): Classification {
  return { target, source: target, kind, scope, origin, ...extra };
}

export function classifyPath(filePath: string): Classification | null {
  const path = normalizePath(filePath);
  const lower = path.toLowerCase();
  const base = basename(path);
  const parts = segments(path);
  const lowerParts = parts.map((part) => part.toLowerCase());
  const entryFile = base;

  // OpenClaw uses a global state directory and agent workspace files.
  const openclawIndex = lowerParts.indexOf('.openclaw');
  if (openclawIndex >= 0) {
    if (base === 'openclaw.json' || base === '.env') return make('openclaw', 'config', 'global', 'user', { entryFile });
    if (lowerParts[openclawIndex + 1]?.startsWith('workspace')) {
      if (MEMORY_FILES.has(base) || lowerParts[openclawIndex + 2] === 'memory') return make('openclaw', 'memory', 'workspace', 'user', { entryFile });
      if (INSTRUCTION_FILES.has(base)) return make('openclaw', 'instruction', 'workspace', 'user', { entryFile });
    }
    if (base.endsWith('.md')) return make('openclaw', 'instruction', 'global', 'user', { entryFile });
  }

  // Cursor project rule formats.
  if (lower.includes('/.cursor/rules/') && (lower.endsWith('.mdc') || lower.endsWith('.md'))) {
    return make('cursor', 'rule', 'project', 'project', { entryFile });
  }
  if (base === '.cursorrules') return make('cursor', 'rule', 'project', 'project', { entryFile });

  // Hermes active, bundled, optional, and hub-managed skills.
  const hermesIndex = lowerParts.indexOf('.hermes');
  if (hermesIndex >= 0) {
    const next = lowerParts[hermesIndex + 1];
    if (next === 'hermes-agent') {
      const repoArea = lowerParts[hermesIndex + 2];
      if ((repoArea === 'skills' || repoArea === 'optional-skills') && base === 'SKILL.md') {
        return make('hermes', 'skill', 'bundled', 'bundled', {
          category: parts.length - hermesIndex > 5 ? parts[hermesIndex + 3] : undefined,
          entryFile
        });
      }
    }
    if (next === 'skills') {
      if (lowerParts[hermesIndex + 2] === '.hub') {
        const scope: SkillScope = lower.includes('/.hub/quarantine/') ? 'temporary' : 'cache';
        const origin: SkillOrigin = lower.includes('/.hub/quarantine/') ? 'temporary' : 'cache';
        if (base === 'SKILL.md') return make('hermes', 'skill', scope, origin, { category: skillCategory(parts.slice(hermesIndex + 1), 'skills'), entryFile });
        return make('hermes', 'config', scope, origin, { entryFile });
      }
      if (base === 'SKILL.md') {
        return make('hermes', 'skill', 'global', 'user', { category: skillCategory(parts.slice(hermesIndex + 1), 'skills'), entryFile });
      }
    }
    if (base === 'config.yaml' || base === 'config.yml') return make('hermes', 'config', 'global', 'user', { entryFile });
  }

  // Claude Code personal/project/plugin files.
  const claudeIndex = lowerParts.indexOf('.claude');
  if (claudeIndex >= 0) {
    const next = lowerParts[claudeIndex + 1];
    const homeScoped = isHomeRelative(path) || isUserHomePath(parts);
    const defaultScope = homeScoped ? 'global' : 'project';
    const defaultOrigin = homeScoped ? 'user' : 'project';

    if (next === 'plugins') {
      const cacheOrMarketplace = lowerParts[claudeIndex + 2];
      const skillsIndex = lowerParts.indexOf('skills', claudeIndex + 1);
      const origin: SkillOrigin = cacheOrMarketplace === 'cache' ? 'cache' : cacheOrMarketplace === 'marketplaces' ? 'marketplace' : 'plugin';
      const scope: SkillScope = cacheOrMarketplace === 'cache' ? 'cache' : 'plugin';
      if (skillsIndex >= 0 && base === 'SKILL.md') return make('claude-code', 'plugin-skill', scope, origin, { container: claudePluginContainer(parts, lowerParts, claudeIndex, skillsIndex), entryFile });
      if (base === 'plugin.json' || base === 'hooks.json') return make('claude-code', base === 'hooks.json' ? 'hook' : 'config', scope, origin, { container: pluginContainer(parts, skillsIndex >= 0 ? skillsIndex : parts.length - 1), entryFile });
    }

    if (next === 'skills') {
      if (base === 'SKILL.md') return make('claude-code', 'skill', defaultScope, defaultOrigin, { category: skillCategory(parts.slice(claudeIndex + 1), 'skills'), entryFile });
      if (lower.includes('/rules/') && base.endsWith('.md')) return make('claude-code', 'rule', defaultScope, defaultOrigin, { category: segmentAfter(parts.slice(claudeIndex + 1), 'skills'), entryFile });
    }
    if (next === 'rules' && base.endsWith('.md')) return make('claude-code', 'rule', defaultScope, defaultOrigin, { entryFile });
    if (INSTRUCTION_FILES.has(base)) return make('claude-code', 'instruction', defaultScope, defaultOrigin, { entryFile });
    if (base === 'settings.json' || base === 'settings.local.json') return make('claude-code', 'config', defaultScope, defaultOrigin, { entryFile });
  }

  // Codex CLI config/cache and official .agents skill/plugin locations.
  const codexIndex = lowerParts.indexOf('.codex');
  if (codexIndex >= 0) {
    if (lower.includes('/.codex/.tmp/plugins/')) {
      const skillsIndex = lowerParts.indexOf('skills', codexIndex + 1);
      if (skillsIndex >= 0 && base === 'SKILL.md') return make('codex', 'plugin-skill', 'temporary', 'temporary', { container: pluginContainer(parts, skillsIndex), entryFile });
      if (base === 'plugin.json' || base === 'marketplace.json') return make('codex', 'config', 'temporary', 'temporary', { entryFile });
    }
    if (lower.includes('/.codex/plugins/cache/')) {
      const skillsIndex = lowerParts.indexOf('skills', codexIndex + 1);
      if (skillsIndex >= 0 && base === 'SKILL.md') return make('codex', 'plugin-skill', 'cache', 'cache', { container: pluginContainer(parts, skillsIndex), entryFile });
      return make('codex', 'config', 'cache', 'cache', { entryFile });
    }
    const { scope, origin } = globalOrProject(path, parts);
    if (nextCodexFile(base)) return make('codex', base === 'hooks.json' ? 'hook' : 'config', scope, origin, { entryFile });
    if (INSTRUCTION_FILES.has(base)) return make('codex', 'instruction', scope, origin, { entryFile });
    if (lower.includes('/.codex/rules/') && lower.endsWith('.rules')) return make('codex', 'rule', scope, origin, { entryFile });
    if (lower.includes('/.codex/agents/') && lower.endsWith('.toml')) return make('codex', 'agent', scope, origin, { entryFile });
  }

  const agentsIndex = lowerParts.indexOf('.agents');
  if (agentsIndex >= 0) {
    const { scope, origin } = globalOrProject(path, parts);
    const next = lowerParts[agentsIndex + 1];
    if (next === 'skills' && base === 'SKILL.md') return make('codex', 'skill', scope, origin, { category: skillCategory(parts.slice(agentsIndex + 1), 'skills'), entryFile });
    if (next === 'plugins') {
      if (base === 'marketplace.json') return make('codex', 'marketplace', scope, origin, { entryFile });
      const skillsIndex = lowerParts.indexOf('skills', agentsIndex + 1);
      if (skillsIndex >= 0 && base === 'SKILL.md') return make('codex', 'plugin-skill', 'plugin', 'plugin', { container: pluginContainer(parts, skillsIndex), entryFile });
    }
  }

  if (lower.startsWith('/etc/codex/')) {
    if (lower.includes('/skills/') && base === 'SKILL.md') return make('codex', 'skill', 'system', 'system', { category: skillCategory(parts.slice(1), 'skills'), entryFile });
    if (base === 'config.toml') return make('codex', 'config', 'system', 'system', { entryFile });
  }

  // Generic project-root instruction fallbacks.
  if (base === 'AGENTS.md' || base === 'AGENTS.override.md') return make('codex', 'instruction', 'project', 'project', { entryFile });
  if (base === 'CLAUDE.md' || base === 'CLAUDE.local.md') return make('claude-code', 'instruction', 'project', 'project', { entryFile });

  // Last-resort SKILL.md support: preserve discoverability without pretending it is Claude Code.
  if (base === 'SKILL.md') {
    const { scope, origin } = globalOrProject(path, parts);
    return make('generic', 'skill', scope, origin, { entryFile });
  }

  return null;
}

function nextCodexFile(base: string): boolean {
  return base === 'config.toml' || base === 'hooks.json';
}
