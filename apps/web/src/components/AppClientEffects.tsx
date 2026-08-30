'use client';

import { useEffect } from 'react';
import {
  applyThemePreference,
  getStoredPreference,
  THEME_PREFERENCE_SLOT,
} from '../platform/browser/preferences';

interface AppClientEffectsProps {
  locale: string;
}

export function AppClientEffects({ locale }: AppClientEffectsProps) {
  useEffect(() => {
    document.documentElement.lang = locale;
    applyThemePreference(getStoredPreference(THEME_PREFERENCE_SLOT, 'system'));
  }, [locale]);

  return null;
}
