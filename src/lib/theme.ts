export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'skillage:theme';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function getStoredTheme(storage: StorageLike | undefined | null): ThemePreference {
  if (!storage) return 'system';
  const value = storage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(value) ? value : 'system';
}

export function storeTheme(storage: StorageLike | undefined | null, preference: ThemePreference): void {
  storage?.setItem(THEME_STORAGE_KEY, preference);
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

export function applyTheme(root: HTMLElement, theme: ResolvedTheme): void {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}
