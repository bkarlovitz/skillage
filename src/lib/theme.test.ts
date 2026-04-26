import { describe, expect, it } from 'vitest';
import { applyTheme, getStoredTheme, resolveTheme, type ThemePreference } from './theme';

describe('theme preferences', () => {
  it('resolves system preferences to the detected scheme', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('uses explicit light and dark preferences regardless of system scheme', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('ignores invalid stored theme preferences', () => {
    const storage = new Map<string, string>();
    const localStorageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    };

    localStorageLike.setItem('skillage:theme', 'sepia');

    expect(getStoredTheme(localStorageLike)).toBe('system');
  });

  it('applies the resolved theme to the root element', () => {
    const root = document.createElement('html');

    applyTheme(root, 'dark');
    expect(root.dataset.theme).toBe('dark');

    applyTheme(root, 'light');
    expect(root.dataset.theme).toBe('light');
  });

  it('stores valid preferences', () => {
    const validPreferences: ThemePreference[] = ['system', 'light', 'dark'];
    expect(validPreferences).toHaveLength(3);
  });
});
