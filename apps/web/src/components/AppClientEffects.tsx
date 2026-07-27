'use client';

/** Applies locale and theme client effects after the localized application shell mounts. */

import { useEffect } from 'react';
import {
  applyThemePreference,
  getStoredPreference,
  THEME_PREFERENCE_SLOT,
} from '../lib/preferences';

interface AppClientEffectsProps {
  locale: string;
}

/** Synchronizes document language and the persisted theme preference. */
export function AppClientEffects({ locale }: AppClientEffectsProps) {
  useEffect(() => {
    document.documentElement.lang = locale;
    applyThemePreference(getStoredPreference(THEME_PREFERENCE_SLOT, 'system'));
  }, [locale]);

  return null;
}
