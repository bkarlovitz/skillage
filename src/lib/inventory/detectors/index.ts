import { detectClaudeCode } from './claudeCode';
import { detectClaudeDesktop } from './claudeDesktop';
import { detectCodex } from './codex';
import { detectCursor } from './cursor';
import { detectHermes } from './hermes';
import { detectOpenClaw } from './openClaw';
import { mergeDetectorResults, type DetectorFile, type DetectorResult } from './common';

export function detectCoreClients(files: DetectorFile[]): DetectorResult {
  return mergeDetectorResults([
    detectClaudeDesktop(files),
    detectClaudeCode(files),
    detectCodex(files),
    detectCursor(files),
    detectHermes(files),
    detectOpenClaw(files)
  ]);
}
