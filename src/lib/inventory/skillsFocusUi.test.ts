import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('skills-focused inventory UI', () => {
  const app = readFileSync(resolve(process.cwd(), 'src/App.svelte'), 'utf8');

  it('keeps skills directly reachable from primary navigation', () => {
    expect(app).toContain("onclick={() => setResourceFocus('skills')}>Skills</button>");
    expect(app).toContain("resourceFocus === 'skills'");
  });

  it('keeps scanner details behind a disclosure instead of always expanding metadata panels', () => {
    expect(app).toContain('<details class="scanner-disclosure">');
    expect(app).toContain('<summary>Scanner details</summary>');
  });
});
