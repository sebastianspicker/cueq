'use client';

import { useEffect } from 'react';
import { applyThemePreference, getStoredPreference, THEME_STORAGE_KEY } from '../lib/preferences';

interface AppClientEffectsProps {
  locale: string;
}

export function AppClientEffects({ locale }: AppClientEffectsProps) {
  useEffect(() => {
    document.documentElement.lang = locale;
    applyThemePreference(getStoredPreference(THEME_STORAGE_KEY, 'system'));
  }, [locale]);

  return null;
}
