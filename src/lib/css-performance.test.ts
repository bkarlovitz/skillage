import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');

describe('resize-friendly visual system', () => {
  it('avoids viewport-wide decorative gradients that repaint during live resize', () => {
    expect(css).not.toContain('radial-gradient(');
  });

  it('keeps default elevation flat instead of using large blurred box shadows', () => {
    expect(css).not.toMatch(/--shadow-md:\s*0\s+\d+px\s+\d+px/);
  });

  it('does not use sticky table headers in the primary inventory table', () => {
    expect(css).not.toMatch(/\.inventory-table\s+th\s*{[^}]*position:\s*sticky/s);
  });

  it('does not animate table row backgrounds during resize-sensitive interactions', () => {
    expect(css).not.toMatch(/\.inventory-table\s+tbody\s+tr\s*{[^}]*transition:/s);
  });
});
