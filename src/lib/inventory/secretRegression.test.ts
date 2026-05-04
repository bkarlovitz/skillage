import { describe, expect, it } from 'vitest';
import { parseJsonConfig } from './config/json';
import { parseTomlConfig } from './config/toml';
import { redactSensitiveText } from './redaction';
import {
  secretRegressionAuthStoreResource,
  secretRegressionForbiddenValues,
  secretRegressionJsonConfig,
  secretRegressionRawText,
  secretRegressionTomlConfig
} from './secretRegressionFixtures';
import { safeDisplayPreviewText } from './preview';
import { buildSafeResourceDetailPanels } from './safeDetailPanels';

function expectNoForbiddenValues(text: string) {
  for (const value of secretRegressionForbiddenValues) {
    expect(text).not.toContain(value);
  }
}

describe('secret regression fixtures', () => {
  it('redacts raw secret fixture text with stable markers', () => {
    const result = redactSensitiveText(secretRegressionRawText);

    expect(result.text).toMatchInlineSnapshot(`
      "api_key = "[REDACTED]"
      Authorization: Bearer [REDACTED]
      oauth_value = "[REDACTED]"
      password: "[REDACTED]"
      OPENAI_API_KEY=[REDACTED]
      GITHUB_TOKEN=[REDACTED]
      credentialsPath: [REDACTED]"
    `);
    expect(result.warnings.map((warning) => warning.matchType)).toEqual(expect.arrayContaining([
      'api-key',
      'bearer-token',
      'oauth-token',
      'password-field',
      'env-assignment',
      'file-secret-reference'
    ]));
    expectNoForbiddenValues(result.text);
  });

  it('redacts parsed JSON config previews, including env refs and bearer/OAuth values', () => {
    const parsed = parseJsonConfig({
      client: 'cursor',
      path: '/repo/.cursor/mcp.json',
      content: secretRegressionJsonConfig
    });

    expect(parsed.contentPreview.text).toMatchInlineSnapshot(`
      "{
        "mcpServers": {
          "internal": {
            "command": "node",
            "args": [
              "server.js"
            ],
            "env": {
              "INLINE_API_KEY": "[REDACTED]",
              "GITHUB_TOKEN": "[REDACTED]"
            },
            "headers": {
              "Authorization": "Bearer [REDACTED]"
            },
            "oauthValue": "[REDACTED]",
            "password": "[REDACTED]",
            "token_file": "[REDACTED]"
          }
        }
      }"
    `);
    expect(parsed.warnings.some((warning) => warning.kind === 'secret-auth-concern')).toBe(true);
    expectNoForbiddenValues(parsed.contentPreview.text ?? '');
  });

  it('redacts parsed TOML config previews, including env refs and file-secret references', () => {
    const parsed = parseTomlConfig({
      client: 'codex',
      path: '~/.codex/config.toml',
      content: secretRegressionTomlConfig
    });

    expect(parsed.contentPreview.text).toMatchInlineSnapshot(`
      "{
        "mcp_servers": {
          "internal": {
            "command": "node",
            "args": [
              "server.js"
            ],
            "env": {
              "INLINE_API_KEY": "[REDACTED]",
              "GITHUB_TOKEN": "[REDACTED]"
            },
            "authorization_header": "Bearer [REDACTED]",
            "oauth_value": "[REDACTED]",
            "password": "[REDACTED]",
            "credentialsPath": "[REDACTED]"
          }
        }
      }"
    `);
    expect(parsed.warnings.some((warning) => warning.kind === 'secret-auth-concern')).toBe(true);
    expectNoForbiddenValues(parsed.contentPreview.text ?? '');
  });

  it('represents auth-store presence without previewing raw auth content', () => {
    const panels = buildSafeResourceDetailPanels(secretRegressionAuthStoreResource);
    const serialized = JSON.stringify(panels);

    expect(secretRegressionAuthStoreResource.previewPolicy).toBe('unread-sensitive');
    expect(safeDisplayPreviewText(secretRegressionAuthStoreResource)).toBe('');
    expect(serialized).toContain('Sensitive source content is not read or displayed.');
    expect(serialized).not.toContain('token');
  });
});
