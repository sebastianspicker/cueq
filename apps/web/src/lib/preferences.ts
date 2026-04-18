'use client';

export const THEME_STORAGE_KEY = 'cq-theme';
export const PAGE_SIZE_STORAGE_KEY = 'cq-page-size';

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
  } catch {
    // localStorage unavailable
  }
}

export function applyThemePreference(theme: string) {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === 'system' ? '' : theme;
}
