import type { CapabilityResource } from './types';

export const secretRegressionRawText = [
  'api_key = "sk-live-inline-api-key-12345"',
  'Authorization: Bearer bearer-token-value-1234567890',
  'oauth_value = "ya29.oauthRegressionToken12345"',
  'password: "plain-password-value"',
  'OPENAI_API_KEY=sk-prod-env-assignment-12345',
  'GITHUB_TOKEN=$GITHUB_TOKEN',
  'credentialsPath: /repo/secrets/service-account.json'
].join('\n');

export const secretRegressionJsonConfig = JSON.stringify({
  mcpServers: {
    internal: {
      command: 'node',
      args: ['server.js'],
      env: {
        INLINE_API_KEY: 'sk-json-inline-api-key-12345',
        GITHUB_TOKEN: '$GITHUB_TOKEN'
      },
      headers: {
        Authorization: 'Bearer json-bearer-token-1234567890'
      },
      oauthValue: 'ya29.jsonOauthRegressionToken12345',
      password: 'json-password-value',
      token_file: '/repo/.secrets/token.txt'
    }
  }
}, null, 2);

export const secretRegressionTomlConfig = `
[mcp_servers.internal]
command = "node"
args = ["server.js"]
env = { INLINE_API_KEY = "sk-toml-inline-api-key-12345", GITHUB_TOKEN = "$GITHUB_TOKEN" }
authorization_header = "Bearer toml-bearer-token-1234567890"
oauth_value = "xoxb-toml-oauth-regression-token"
password = "toml-password-value"
credentialsPath = "/repo/secrets/service-account.json"
`;

export const secretRegressionForbiddenValues = [
  'sk-live-inline-api-key-12345',
  'bearer-token-value-1234567890',
  'ya29.oauthRegressionToken12345',
  'plain-password-value',
  'sk-prod-env-assignment-12345',
  '$GITHUB_TOKEN',
  '/repo/secrets/service-account.json',
  'sk-json-inline-api-key-12345',
  'json-bearer-token-1234567890',
  'ya29.jsonOauthRegressionToken12345',
  'json-password-value',
  '/repo/.secrets/token.txt',
  'sk-toml-inline-api-key-12345',
  'toml-bearer-token-1234567890',
  'xoxb-toml-oauth-regression-token',
  'toml-password-value'
];

export const secretRegressionAuthStoreResource: CapabilityResource = {
  id: 'secret-regression-auth-store',
  name: 'Codex auth store',
  description: 'Auth store presence without raw credential content.',
  client: 'codex',
  resourceType: 'sensitive-store',
  scope: 'global',
  status: 'sensitive',
  statuses: ['found', 'sensitive'],
  path: '~/.codex/auth.json',
  previewPolicy: 'unread-sensitive',
  evidence: [{
    sourcePath: '~/.codex/auth.json',
    scannerRule: 'secret-regression-auth-store',
    matchedPathPattern: 'auth.json',
    readStatus: 'skipped',
    parseStatus: 'skipped'
  }],
  warnings: [{
    kind: 'secret-auth-concern',
    severity: 'info',
    message: 'Auth store exists; raw credential content is not previewed.'
  }],
  relationships: [],
  tags: ['secret-regression', 'sensitive'],
  metadata: {}
};
