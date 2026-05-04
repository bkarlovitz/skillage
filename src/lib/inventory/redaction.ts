import type { CapabilityWarning } from './types';

export type SecretMatchType =
  | 'api-key'
  | 'bearer-token'
  | 'oauth-token'
  | 'password-field'
  | 'env-assignment'
  | 'file-secret-reference';

export interface RedactionWarning extends CapabilityWarning {
  matchType: SecretMatchType;
}

export interface RedactionResult {
  text: string;
  warnings: RedactionWarning[];
}

interface RedactionRule {
  matchType: SecretMatchType;
  pattern: RegExp;
  replace: (match: string, ...captures: string[]) => string;
}

const secretValue = '[REDACTED]';

const rules: RedactionRule[] = [
  {
    matchType: 'env-assignment',
    pattern: /^([A-Z][A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIALS?)[A-Z0-9_]*\s*=\s*)(["']?)([^\s"']{8,})(["']?)/gim,
    replace: (_match, prefix, quote, _value, endQuote) => `${prefix}${quote}${secretValue}${endQuote}`
  },
  {
    matchType: 'password-field',
    pattern: /(["']?(?:password|passwd|pwd)["']?\s*[:=]\s*)(["'])([^"']{4,})(["'])/gi,
    replace: (_match, prefix, quote, _value, endQuote) => `${prefix}${quote}${secretValue}${endQuote}`
  },
  {
    matchType: 'api-key',
    pattern: /(\b(?:api[_-]?key|access[_-]?key|client[_-]?secret|secret[_-]?key|token)\b\s*[:=]\s*)(["']?)([A-Za-z0-9._~+/=-]{12,})(["']?)/gi,
    replace: (_match, prefix, quote, _value, endQuote) => `${prefix}${quote}${secretValue}${endQuote}`
  },
  {
    matchType: 'bearer-token',
    pattern: /\bBearer\s+([A-Za-z0-9._~+/=-]{12,})/gi,
    replace: () => `Bearer ${secretValue}`
  },
  {
    matchType: 'oauth-token',
    pattern: /\b(?:ya29\.[A-Za-z0-9._-]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|gh[opsu]_[A-Za-z0-9_]{12,})\b/g,
    replace: () => secretValue
  },
  {
    matchType: 'file-secret-reference',
    pattern: /((?:"|')?(?:secret|token|credential|credentials|password)[_-]?(?:file|path)(?:"|')?\s*[:=]\s*)(["']?)([^"'\s,}]+)(["']?)/gi,
    replace: (_match, prefix, quote, _value, endQuote) => `${prefix}${quote}${secretValue}${endQuote}`
  }
];

function warningFor(matchType: SecretMatchType): RedactionWarning {
  return {
    kind: 'secret-auth-concern',
    severity: 'warning',
    matchType,
    message: `${matchType} value was redacted before preview.`
  };
}

export function redactSensitiveText(text: string): RedactionResult {
  const warnings: RedactionWarning[] = [];
  let redacted = text;

  for (const rule of rules) {
    let matched = false;
    redacted = redacted.replace(rule.pattern, (...args: string[]) => {
      matched = true;
      const [match, ...captures] = args;
      return rule.replace(match, ...captures.slice(0, -2));
    });
    if (matched) warnings.push(warningFor(rule.matchType));
  }

  return { text: redacted, warnings };
}
