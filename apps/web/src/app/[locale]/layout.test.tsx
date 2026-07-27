import { describe, expect, it, vi } from 'vitest';
import LocaleLayout, { generateMetadata } from './layout';

vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
}));

describe('LocaleLayout document language', () => {
  it.each(['de', 'en'])(
    'renders the initial %s document with the matching lang',
    async (locale) => {
      const layout = await LocaleLayout({
        children: <p>content</p>,
        params: Promise.resolve({ locale }),
      });

      expect(layout.type).toBe('html');
      expect(layout.props.lang).toBe(locale);
    },
  );

  it.each([
    ['de', 'cueq: Zeiterfassung, Abwesenheit und Dienstplanung'],
    ['en', 'cueq: Time tracking, absence, and roster planning'],
  ])('uses the localized cueq descriptor for %s metadata', async (locale, title) => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale }) });

    expect(metadata.title).toBe(title);
    expect(metadata.applicationName).toBe('cueq');
    expect(metadata.icons).toEqual({ icon: '/icon.svg' });
  });
});
