import { redactSensitiveText } from '../redaction';
import type {
  CapabilityClient,
  CapabilityContentPreview,
  CapabilityEvidence,
  CapabilityWarning
} from '../types';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface ConfigParseError {
  id: string;
  client?: CapabilityClient;
  path: string;
  message: string;
  evidence: CapabilityEvidence;
}

export interface JsonConfigParseInput {
  path: string;
  content: string;
  client?: CapabilityClient;
  scannerRule?: string;
  matchedPathPattern?: string;
}

export interface ParsedJsonConfig {
  format: 'json';
  path: string;
  client?: CapabilityClient;
  value?: JsonValue;
  evidence: CapabilityEvidence;
  parseErrors: ConfigParseError[];
  warnings: CapabilityWarning[];
  contentPreview: CapabilityContentPreview;
}

export interface JsonPathResult<T extends JsonValue = JsonValue> {
  value: T;
  evidence: CapabilityEvidence;
}

export interface JsonObjectEntry {
  key: string;
  value: JsonValue;
  evidence: CapabilityEvidence;
}

function stableId(input: string): string {
  return input.replace(/[^a-zA-Z0-9:_./-]/g, '-');
}

function normalizedMatchedPattern(input: JsonConfigParseInput): string {
  return input.matchedPathPattern ?? input.path.split(/[\\/]/).pop() ?? input.path;
}

function baseEvidence(input: JsonConfigParseInput, parseStatus: CapabilityEvidence['parseStatus'], parsedKeyPath?: string): CapabilityEvidence {
  return {
    sourcePath: input.path,
    scannerRule: input.scannerRule ?? 'json-config-parser',
    matchedPathPattern: normalizedMatchedPattern(input),
    parsedKeyPath,
    readStatus: 'read',
    parseStatus
  };
}

function secretKeyLooksSensitive(key: string): boolean {
  return /(^|[_-])(api[_-]?key|access[_-]?key|client[_-]?secret|secret[_-]?key|token|password|passwd|pwd|credential|credentials)($|[_-])/i.test(key)
    || /^(apiKey|accessKey|clientSecret|secretKey|token|password|passwd|pwd|credential|credentials)$/i.test(key)
    || /^(secret|token|credential|credentials|password)(File|Path)$/i.test(key);
}

function keyPathToString(path: readonly string[]): string {
  return path.join('.');
}

function normalizeKeyPath(keyPath: string | readonly string[]): string[] {
  return typeof keyPath === 'string' ? keyPath.split('.').filter(Boolean) : [...keyPath];
}

function warningForSecretKey(input: JsonConfigParseInput, parsedKeyPath: string): CapabilityWarning {
  return {
    kind: 'secret-auth-concern',
    severity: 'warning',
    message: `Secret-like JSON field ${parsedKeyPath} was redacted before preview.`,
    evidence: baseEvidence(input, 'parsed', parsedKeyPath)
  };
}

function warningFromRedaction(input: JsonConfigParseInput, message: string): CapabilityWarning {
  return {
    kind: 'secret-auth-concern',
    severity: 'warning',
    message,
    evidence: baseEvidence(input, 'partially-parsed')
  };
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function jsonValueIsObject(value: JsonValue | undefined): value is JsonObject {
  return isJsonObject(value);
}

export function jsonValueIsArray(value: JsonValue | undefined): value is JsonValue[] {
  return Array.isArray(value);
}

function redactParsedJson(value: JsonValue, input: JsonConfigParseInput, warnings: CapabilityWarning[], path: string[] = []): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item, index) => redactParsedJson(item, input, warnings, [...path, String(index)]));
  }

  if (!isJsonObject(value)) {
    return value;
  }

  const redacted: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    const parsedKeyPath = keyPathToString(childPath);

    if (secretKeyLooksSensitive(key) && (typeof child === 'string' || typeof child === 'number' || typeof child === 'boolean')) {
      redacted[key] = '[REDACTED]';
      warnings.push(warningForSecretKey(input, parsedKeyPath));
      continue;
    }

    redacted[key] = redactParsedJson(child, input, warnings, childPath);
  }

  return redacted;
}

function previewForParsedJson(value: JsonValue, input: JsonConfigParseInput): { preview: CapabilityContentPreview; warnings: CapabilityWarning[] } {
  const warnings: CapabilityWarning[] = [];
  const redactedValue = redactParsedJson(value, input, warnings);
  const redactedText = redactSensitiveText(JSON.stringify(redactedValue, null, 2));
  return {
    preview: {
      policy: 'redacted-preview',
      rawPreviewAllowed: false,
      text: redactedText.text
    },
    warnings: [
      ...warnings,
      ...redactedText.warnings.map((warning) => warningFromRedaction(input, warning.message))
    ]
  };
}

function previewForMalformedJson(input: JsonConfigParseInput): { preview: CapabilityContentPreview; warnings: CapabilityWarning[] } {
  const redacted = redactSensitiveText(input.content);
  return {
    preview: {
      policy: 'redacted-preview',
      rawPreviewAllowed: false,
      text: redacted.text,
      reason: 'Malformed JSON is shown only after regex redaction.'
    },
    warnings: redacted.warnings.map((warning) => warningFromRedaction(input, warning.message))
  };
}

export function evidenceForJsonPath(document: ParsedJsonConfig, keyPath: string | readonly string[]): CapabilityEvidence {
  const parsedKeyPath = keyPathToString(normalizeKeyPath(keyPath));
  return {
    ...document.evidence,
    parsedKeyPath,
    parseStatus: document.value === undefined ? 'parse-error' : 'parsed'
  };
}

export function parseJsonConfig(input: JsonConfigParseInput): ParsedJsonConfig {
  try {
    const value = JSON.parse(input.content) as JsonValue;
    const { preview, warnings } = previewForParsedJson(value, input);
    return {
      format: 'json',
      path: input.path,
      client: input.client,
      value,
      evidence: baseEvidence(input, 'parsed'),
      parseErrors: [],
      warnings,
      contentPreview: preview
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON config.';
    const evidence = baseEvidence(input, 'parse-error');
    const { preview, warnings } = previewForMalformedJson(input);
    return {
      format: 'json',
      path: input.path,
      client: input.client,
      evidence,
      parseErrors: [{
        id: `parse-error:${input.client ?? 'unknown'}:${stableId(input.path)}`,
        client: input.client,
        path: input.path,
        message,
        evidence
      }],
      warnings,
      contentPreview: preview
    };
  }
}

export function getJsonValueAtPath<T extends JsonValue = JsonValue>(document: ParsedJsonConfig, keyPath: string | readonly string[]): JsonPathResult<T> | undefined {
  if (document.value === undefined) return undefined;
  const parts = normalizeKeyPath(keyPath);
  let current: JsonValue | undefined = document.value;

  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = Number(part);
      current = Number.isInteger(index) ? current[index] : undefined;
    } else if (isJsonObject(current)) {
      current = current[part];
    } else {
      current = undefined;
    }

    if (current === undefined) return undefined;
  }

  return {
    value: current as T,
    evidence: evidenceForJsonPath(document, parts)
  };
}

export function getJsonStringAtPath(document: ParsedJsonConfig, keyPath: string | readonly string[]): JsonPathResult<string> | undefined {
  const result = getJsonValueAtPath(document, keyPath);
  return typeof result?.value === 'string'
    ? { value: result.value, evidence: result.evidence }
    : undefined;
}

export function getJsonObjectAtPath(document: ParsedJsonConfig, keyPath: string | readonly string[]): JsonPathResult<JsonObject> | undefined {
  const result = getJsonValueAtPath(document, keyPath);
  return isJsonObject(result?.value)
    ? { value: result.value, evidence: result.evidence }
    : undefined;
}

export function getJsonObjectEntriesAtPath(document: ParsedJsonConfig, keyPath: string | readonly string[]): JsonObjectEntry[] {
  const result = getJsonObjectAtPath(document, keyPath);
  if (!result) return [];
  const basePath = normalizeKeyPath(keyPath);

  return Object.entries(result.value).map(([key, value]) => ({
    key,
    value,
    evidence: evidenceForJsonPath(document, [...basePath, key])
  }));
}
