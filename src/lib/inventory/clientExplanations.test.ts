import { describe, expect, it } from 'vitest';
import { buildClientSpecificExplanations } from './clientExplanations';
import { buildClientDetailModel } from './clientSummary';
import { getFixtureScenario } from './fixtures';

describe('client-specific explanations', () => {
  it('explains Claude Desktop restart requirements without performing restart actions', () => {
    const detail = buildClientDetailModel(getFixtureScenario('full-machine').summary, 'claude-desktop');
    const restart = buildClientSpecificExplanations(detail).find((item) => item.kind === 'restart-required');

    expect(restart).toMatchObject({
      title: 'Restart May Be Required',
      severity: 'info'
    });
    expect(restart?.body).toContain('does not reload or restart');
    expect(restart?.sourcePath).toBe('~/Library/Application Support/Claude/claude_desktop_config.json');
  });

  it('explains project trust gates for Claude Code and Codex without claiming runtime activity', () => {
    const claudeCode = buildClientSpecificExplanations(buildClientDetailModel(getFixtureScenario('full-machine').summary, 'claude-code'));
    const codex = buildClientSpecificExplanations(buildClientDetailModel(getFixtureScenario('full-machine').summary, 'codex'));

    expect(claudeCode.find((item) => item.kind === 'trust-gate')?.caveat).toContain('must not treat this resource as active');
    expect(codex.find((item) => item.kind === 'trust-gate')?.sourcePath).toBe('/repo/AGENTS.md');
  });

  it('explains Codex managed/admin settings as source evidence only', () => {
    const explanations = buildClientSpecificExplanations(buildClientDetailModel(getFixtureScenario('full-machine').summary, 'codex'));
    const managed = explanations.find((item) => item.kind === 'managed-admin');

    expect(managed).toMatchObject({
      title: 'Managed/Admin Setting',
      sourcePath: '/etc/codex/config.toml'
    });
    expect(managed?.caveat).toContain('does not prove the runtime policy was applied');
  });

  it('explains local/private files for project inventory scenarios', () => {
    const explanations = buildClientSpecificExplanations(buildClientDetailModel(getFixtureScenario('project-inherited-globals').summary, 'claude-code'));
    const localPrivate = explanations.find((item) => item.kind === 'local-private');

    expect(localPrivate?.sourcePath).toBe('/repo/.claude/settings.local.json');
    expect(localPrivate?.caveat).toContain('without being visible to collaborators');
  });

  it('explains Hermes profile worlds without merging profiles', () => {
    const explanations = buildClientSpecificExplanations(buildClientDetailModel(getFixtureScenario('full-machine').summary, 'hermes'));
    const profiles = explanations.filter((item) => item.kind === 'profile-world');

    expect(profiles.map((item) => item.sourcePath)).toEqual(['~/.hermes/profiles/default', '~/.hermes/profiles/work']);
    expect(profiles.every((item) => item.caveat.includes('keeps profile resources separate'))).toBe(true);
  });

  it('explains OpenClaw gateway mode as incomplete local runtime evidence', () => {
    const explanations = buildClientSpecificExplanations(buildClientDetailModel(getFixtureScenario('full-machine').summary, 'openclaw'));
    const gateway = explanations.find((item) => item.kind === 'gateway-mode');

    expect(gateway?.sourcePath).toBe('~/.openclaw/openclaw.json');
    expect(gateway?.caveat).toContain('may not contain the complete runtime state');
  });

  it('explains Cursor schema and parse mismatches as partial static evidence', () => {
    const explanations = buildClientSpecificExplanations(buildClientDetailModel(getFixtureScenario('parse-read-error').summary, 'cursor'));
    const schema = explanations.find((item) => item.kind === 'schema-mismatch');

    expect(schema?.title).toBe('Schema Or Parse Mismatch');
    expect(schema?.caveat).toContain('may be partial');
  });
});
