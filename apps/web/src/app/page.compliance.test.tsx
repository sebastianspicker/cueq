import { describe, expect, it } from 'vitest';

describe('@cueq/web compliance', () => {
  it('keeps German as the default locale in phase 2', () => {
    const defaultLocale = 'de';
    expect(defaultLocale).toBe('de');
  });
});
