export type SkillTarget = 'claude-code' | 'codex' | 'hermes' | 'openclaw' | 'cursor' | 'generic';

export type SkillKind = 'skill' | 'rule' | 'instruction' | 'config';

export type SkillScope = 'global' | 'project' | 'sample';

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
  kind: SkillKind;
  scope: SkillScope;
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
