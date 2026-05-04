import { redactSensitiveText } from '../redaction';
import type {
  CapabilityClient,
  CapabilityContentPreview,
  CapabilityEvidence,
  CapabilityWarning
} from '../types';
import type { ConfigParseError, JsonObject, JsonValue } from './json';

export type TomlValue = JsonValue;
export type TomlObject = JsonObject;

export interface TomlConfigParseInput {
  path: string;
  content: string;
  client?: CapabilityClient;
  scannerRule?: string;
  matchedPathPattern?: string;
}

export interface ParsedTomlConfig {
  format: 'toml';
  path: string;
  client?: CapabilityClient;
  value?: TomlObject;
  evidence: CapabilityEvidence;
  parseErrors: ConfigParseError[];
  warnings: CapabilityWarning[];
  contentPreview: CapabilityContentPreview;
}

export interface TomlPathResult<T extends TomlValue = TomlValue> {
  value: T;
  evidence: CapabilityEvidence;
}

function stableId(input: string): string {
  return input.replace(/[^a-zA-Z0-9:_./-]/g, '-');
}

function normalizedMatchedPattern(input: TomlConfigParseInput): string {
  return input.matchedPathPattern ?? input.path.split(/[\\/]/).pop() ?? input.path;
}

function baseEvidence(input: TomlConfigParseInput, parseStatus: CapabilityEvidence['parseStatus'], parsedKeyPath?: string): CapabilityEvidence {
  return {
    sourcePath: input.path,
    scannerRule: input.scannerRule ?? 'toml-config-parser',
    matchedPathPattern: normalizedMatchedPattern(input),
    parsedKeyPath,
    readStatus: 'read',
    parseStatus
  };
}

function keyPathToString(path: readonly string[]): string {
  return path.join('.');
}

function normalizeKeyPath(keyPath: string | readonly string[]): string[] {
  return typeof keyPath === 'string' ? keyPath.split('.').filter(Boolean) : [...keyPath];
}

function secretKeyLooksSensitive(key: string): boolean {
  return /(^|[_-])(api[_-]?key|access[_-]?key|client[_-]?secret|secret[_-]?key|token|password|passwd|pwd|credential|credentials)($|[_-])/i.test(key)
    || /^(apiKey|accessKey|clientSecret|secretKey|token|password|passwd|pwd|credential|credentials)$/i.test(key);
}

function isObject(value: TomlValue | undefined): value is TomlObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripComment(line: string): string {
  let quote: '"' | "'" | undefined;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote === '"' && char === '\\' && !escaped) {
      escaped = true;
      continue;
    }
    if ((char === '"' || char === "'") && !escaped) {
      quote = quote === char ? undefined : quote ?? char;
    }
    if (char === '#' && quote === undefined) {
      return line.slice(0, index).trim();
    }
    escaped = false;
  }

  return line.trim();
}

function splitTopLevel(value: string, separator: string): string[] {
  const parts: string[] = [];
  let quote: '"' | "'" | undefined;
  let escaped = false;
  let squareDepth = 0;
  let curlyDepth = 0;
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote === '"' && char === '\\' && !escaped) {
      escaped = true;
      continue;
    }
    if ((char === '"' || char === "'") && !escaped) {
      quote = quote === char ? undefined : quote ?? char;
    } else if (quote === undefined) {
      if (char === '[') squareDepth += 1;
      if (char === ']') squareDepth -= 1;
      if (char === '{') curlyDepth += 1;
      if (char === '}') curlyDepth -= 1;
      if (char === separator && squareDepth === 0 && curlyDepth === 0) {
        parts.push(value.slice(start, index).trim());
        start = index + 1;
      }
    }
    escaped = false;
  }

  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function parseKeyPath(rawKey: string): string[] {
  return splitTopLevel(rawKey, '.').map((part) => part.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

function parseString(raw: string): string | undefined {
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return JSON.parse(raw) as string;
    } catch {
      return raw.slice(1, -1);
    }
  }

  if (raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1);
  }

  return undefined;
}

function parseValue(raw: string): TomlValue | undefined {
  const value = raw.trim();
  if (!value) return undefined;

  const stringValue = parseString(value);
  if (stringValue !== undefined) return stringValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^[+-]?\d+(?:\.\d+)?$/.test(value)) return Number(value);

  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    return inner ? splitTopLevel(inner, ',').map(parseValue).map((item) => item ?? '') : [];
  }

  if (value.startsWith('{') && value.endsWith('}')) {
    const object: TomlObject = {};
    const inner = value.slice(1, -1).trim();
    if (!inner) return object;

    for (const part of splitTopLevel(inner, ',')) {
      const equalIndex = part.indexOf('=');
      if (equalIndex <= 0) return undefined;
      const key = part.slice(0, equalIndex).trim();
      const childValue = parseValue(part.slice(equalIndex + 1));
      if (childValue === undefined) return undefined;
      setValueAtPath(object, parseKeyPath(key), childValue);
    }

    return object;
  }

  return undefined;
}

function ensureObjectAtPath(root: TomlObject, path: readonly string[]): TomlObject {
  let current = root;
  for (const part of path) {
    const next = current[part];
    if (!isObject(next)) {
      current[part] = {};
    }
    current = current[part] as TomlObject;
  }
  return current;
}

function setValueAtPath(root: TomlObject, keyPath: readonly string[], value: TomlValue): void {
  const target = ensureObjectAtPath(root, keyPath.slice(0, -1));
  const key = keyPath[keyPath.length - 1];
  if (key) target[key] = value;
}

function getArrayTableTarget(root: TomlObject, path: readonly string[]): TomlObject {
  const parent = ensureObjectAtPath(root, path.slice(0, -1));
  const key = path[path.length - 1] ?? '';
  const existing = parent[key];
  if (!Array.isArray(existing)) parent[key] = [];
  const array = parent[key] as TomlValue[];
  const target: TomlObject = {};
  array.push(target);
  return target;
}

function warningForSecretKey(input: TomlConfigParseInput, parsedKeyPath: string): CapabilityWarning {
  return {
    kind: 'secret-auth-concern',
    severity: 'warning',
    message: `Secret-like TOML field ${parsedKeyPath} was redacted before preview.`,
    evidence: baseEvidence(input, 'parsed', parsedKeyPath)
  };
}

function redactParsedToml(value: TomlValue, input: TomlConfigParseInput, warnings: CapabilityWarning[], path: string[] = []): TomlValue {
  if (Array.isArray(value)) {
    return value.map((item, index) => redactParsedToml(item, input, warnings, [...path, String(index)]));
  }

  if (!isObject(value)) {
    return value;
  }

  const redacted: TomlObject = {};
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    const parsedKeyPath = keyPathToString(childPath);

    if (secretKeyLooksSensitive(key) && (typeof child === 'string' || typeof child === 'number' || typeof child === 'boolean')) {
      redacted[key] = '[REDACTED]';
      warnings.push(warningForSecretKey(input, parsedKeyPath));
      continue;
    }

    redacted[key] = redactParsedToml(child, input, warnings, childPath);
  }

  return redacted;
}

function makeParseError(input: TomlConfigParseInput, lineNumber: number, message: string): ConfigParseError {
  return {
    id: `parse-error:${input.client ?? 'unknown'}:${stableId(input.path)}:${lineNumber}`,
    client: input.client,
    path: input.path,
    message: `Line ${lineNumber}: ${message}`,
    evidence: baseEvidence(input, 'parse-error')
  };
}

function previewForToml(value: TomlObject | undefined, input: TomlConfigParseInput, parseErrors: ConfigParseError[]): { preview: CapabilityContentPreview; warnings: CapabilityWarning[] } {
  if (!value) {
    const redacted = redactSensitiveText(input.content);
    return {
      preview: {
        policy: 'redacted-preview',
        rawPreviewAllowed: false,
        text: redacted.text,
        reason: 'Malformed TOML is shown only after regex redaction.'
      },
      warnings: redacted.warnings.map((warning) => ({
        kind: 'secret-auth-concern',
        severity: 'warning',
        message: warning.message,
        evidence: baseEvidence(input, 'partially-parsed')
      }))
    };
  }

  const warnings: CapabilityWarning[] = [];
  const redactedValue = redactParsedToml(value, input, warnings);
  return {
    preview: {
      policy: 'redacted-preview',
      rawPreviewAllowed: false,
      text: JSON.stringify(redactedValue, null, 2),
      reason: parseErrors.length ? 'TOML was partially parsed; malformed lines were omitted from preview.' : undefined
    },
    warnings
  };
}

export function parseTomlConfig(input: TomlConfigParseInput): ParsedTomlConfig {
  const root: TomlObject = {};
  const parseErrors: ConfigParseError[] = [];
  let currentPath: string[] = [];
  let currentTarget = root;

  for (const [index, rawLine] of input.content.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const line = stripComment(rawLine);
    if (!line) continue;

    if (line.startsWith('[[') || line.startsWith('[')) {
      const arrayTable = line.startsWith('[[');
      const expectedEnd = arrayTable ? ']]' : ']';
      if (!line.endsWith(expectedEnd)) {
        parseErrors.push(makeParseError(input, lineNumber, 'Invalid TOML table header.'));
        continue;
      }

      const tableName = line.slice(arrayTable ? 2 : 1, arrayTable ? -2 : -1).trim();
      const tablePath = parseKeyPath(tableName);
      if (!tablePath.length) {
        parseErrors.push(makeParseError(input, lineNumber, 'TOML table header is empty.'));
        continue;
      }

      currentPath = tablePath;
      currentTarget = arrayTable ? getArrayTableTarget(root, tablePath) : ensureObjectAtPath(root, tablePath);
      continue;
    }

    const equalIndex = line.indexOf('=');
    if (equalIndex <= 0) {
      parseErrors.push(makeParseError(input, lineNumber, 'Expected key = value assignment.'));
      continue;
    }

    const keyPath = parseKeyPath(line.slice(0, equalIndex).trim());
    const value = parseValue(line.slice(equalIndex + 1));
    if (!keyPath.length || value === undefined) {
      parseErrors.push(makeParseError(input, lineNumber, 'Invalid TOML assignment value.'));
      continue;
    }

    setValueAtPath(currentTarget, keyPath, value);
  }

  const parseStatus: CapabilityEvidence['parseStatus'] = parseErrors.length ? 'parse-error' : 'parsed';
  const hasParsedValue = Object.keys(root).length > 0;
  const value = hasParsedValue ? root : undefined;
  const { preview, warnings } = previewForToml(value, input, parseErrors);

  return {
    format: 'toml',
    path: input.path,
    client: input.client,
    value,
    evidence: baseEvidence(input, parseStatus),
    parseErrors,
    warnings,
    contentPreview: preview
  };
}

export function evidenceForTomlPath(document: ParsedTomlConfig, keyPath: string | readonly string[]): CapabilityEvidence {
  return {
    ...document.evidence,
    parsedKeyPath: keyPathToString(normalizeKeyPath(keyPath)),
    parseStatus: document.value === undefined ? 'parse-error' : 'parsed'
  };
}

export function getTomlValueAtPath<T extends TomlValue = TomlValue>(document: ParsedTomlConfig, keyPath: string | readonly string[]): TomlPathResult<T> | undefined {
  if (document.value === undefined) return undefined;
  const parts = normalizeKeyPath(keyPath);
  let current: TomlValue | undefined = document.value;

  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = Number(part);
      current = Number.isInteger(index) ? current[index] : undefined;
    } else if (isObject(current)) {
      current = current[part];
    } else {
      current = undefined;
    }

    if (current === undefined) return undefined;
  }

  return {
    value: current as T,
    evidence: evidenceForTomlPath(document, parts)
  };
}

export function getTomlStringAtPath(document: ParsedTomlConfig, keyPath: string | readonly string[]): TomlPathResult<string> | undefined {
  const result = getTomlValueAtPath(document, keyPath);
  return typeof result?.value === 'string'
    ? { value: result.value, evidence: result.evidence }
    : undefined;
}

export function getTomlObjectAtPath(document: ParsedTomlConfig, keyPath: string | readonly string[]): TomlPathResult<TomlObject> | undefined {
  const result = getTomlValueAtPath(document, keyPath);
  return isObject(result?.value)
    ? { value: result.value, evidence: result.evidence }
    : undefined;
}

export function getTomlArrayAtPath(document: ParsedTomlConfig, keyPath: string | readonly string[]): TomlPathResult<TomlValue[]> | undefined {
  const result = getTomlValueAtPath(document, keyPath);
  return Array.isArray(result?.value)
    ? { value: result.value, evidence: result.evidence }
    : undefined;
}
