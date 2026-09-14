'use client';

export const THEME_PREFERENCE_SLOT = 'cq-theme';
export const PAGE_SIZE_PREFERENCE_SLOT = 'cq-page-size';

export type ThemePreference = 'system' | 'light' | 'dark';

export function getStoredPreference(key: string, fallback: string): string {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function setStoredPreference(key: string, value: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function applyThemePreference(theme: string) {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === 'system' ? '' : theme;
}

export function toggleThemePreference(): ThemePreference {
  const stored = getStoredPreference(THEME_PREFERENCE_SLOT, 'system');
  const resolved =
    stored === 'system'
      ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : stored;
  const next: ThemePreference = resolved === 'dark' ? 'light' : 'dark';
  setStoredPreference(THEME_PREFERENCE_SLOT, next);
  applyThemePreference(next);
  return next;
}
