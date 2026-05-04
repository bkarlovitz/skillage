import { describe, expect, it } from 'vitest';
import { redactSensitiveText } from './redaction';

describe('redactSensitiveText', () => {
  it('redacts API-key-like strings and returns sanitized warnings', () => {
    const result = redactSensitiveText('api_key = "sk-live-1234567890abcdef"');

    expect(result.text).toContain('[REDACTED]');
    expect(result.text).not.toContain('sk-live-1234567890abcdef');
    expect(result.warnings.map((warning) => warning.matchType)).toContain('api-key');
    expect(JSON.stringify(result.warnings)).not.toContain('sk-live-1234567890abcdef');
  });

  it('redacts bearer tokens and OAuth-looking tokens', () => {
    const result = redactSensitiveText([
      'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
      'refresh = ya29.a0AfH6SMBexampleToken',
      'github = ghp_abcdefghijklmnopqrst'
    ].join('\n'));

    expect(result.text).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(result.text).not.toContain('ya29.a0AfH6SMBexampleToken');
    expect(result.text).not.toContain('ghp_abcdefghijklmnopqrst');
    expect(result.warnings.map((warning) => warning.matchType)).toEqual(expect.arrayContaining(['bearer-token', 'oauth-token']));
  });

  it('redacts password fields and env file assignments', () => {
    const result = redactSensitiveText([
      'OPENAI_API_KEY=sk-prod-abcdefghijk',
      '"password": "correct-horse-battery"',
      'DATABASE_PASSWORD="postgres-secret"'
    ].join('\n'));

    expect(result.text).toContain('OPENAI_API_KEY=[REDACTED]');
    expect(result.text).toContain('"password": "[REDACTED]"');
    expect(result.text).toContain('DATABASE_PASSWORD="[REDACTED]"');
    expect(result.text).not.toContain('correct-horse-battery');
    expect(result.text).not.toContain('postgres-secret');
  });

  it('redacts file-secret references', () => {
    const result = redactSensitiveText([
      'token_file = "/home/me/.config/token.txt"',
      'credentialsPath: /repo/secrets/service-account.json'
    ].join('\n'));

    expect(result.text).toContain('token_file = "[REDACTED]"');
    expect(result.text).toContain('credentialsPath: [REDACTED]');
    expect(result.text).not.toContain('/home/me/.config/token.txt');
    expect(result.text).not.toContain('/repo/secrets/service-account.json');
    expect(result.warnings.map((warning) => warning.matchType)).toContain('file-secret-reference');
  });

  it('does not redact ordinary instructions or short placeholder values', () => {
    const text = [
      'Run tests before changing behavior.',
      'token budget should be small.',
      'password: TODO'
    ].join('\n');
    const result = redactSensitiveText(text);

    expect(result.text).toBe(text);
    expect(result.warnings).toEqual([]);
  });
});
