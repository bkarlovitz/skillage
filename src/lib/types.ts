export type SkillTarget = 'claude-code' | 'codex' | 'hermes' | 'openclaw' | 'cursor' | 'generic';

export type SkillKind = 'skill' | 'plugin-skill' | 'rule' | 'instruction' | 'config' | 'hook' | 'agent' | 'memory' | 'marketplace';

export type SkillScope = 'system' | 'global' | 'project' | 'workspace' | 'plugin' | 'cache' | 'temporary' | 'bundled' | 'sample';

export type SkillOrigin = 'user' | 'project' | 'system' | 'bundled' | 'plugin' | 'marketplace' | 'cache' | 'temporary' | 'external' | 'sample';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: ValidationSeverity;
  message: string;
}

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  target: SkillTarget;
  source?: SkillTarget;
  kind: SkillKind;
  scope: SkillScope;
  origin?: SkillOrigin;
  category?: string;
  container?: string;
  path: string;
  entryFile?: string;
  body: string;
  tags: string[];
  metadata: Record<string, string | boolean | string[]>;
  issues: ValidationIssue[];
}

export interface ScanSummary {
  items: SkillItem[];
  roots: string[];
  warnings: ValidationIssue[];
}
