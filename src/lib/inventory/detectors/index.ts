import { detectClaudeCode } from './claudeCode';
import { detectClaudeDesktop } from './claudeDesktop';
import { detectCodex } from './codex';
import { detectCursor } from './cursor';
import { detectHermes } from './hermes';
import { detectOpenClaw } from './openClaw';
import { mergeDetectorResults, type DetectorFile, type DetectorOptions, type DetectorResult } from './common';

export function detectCoreClients(files: DetectorFile[], options: DetectorOptions = {}): DetectorResult {
  return mergeDetectorResults([
    detectClaudeDesktop(files),
    detectClaudeCode(files, options),
    detectCodex(files, options),
    detectCursor(files, options),
    detectHermes(files),
    detectOpenClaw(files)
  ]);
}
