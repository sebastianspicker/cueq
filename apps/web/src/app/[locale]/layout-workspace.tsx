/** Locale layout implementation that wires translated messages and client providers. */

import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { AppClientEffects } from '../../components/AppClientEffects';
import { AppWorkspace } from '../../components/AppWorkspace';
import { ApiProvider } from '../../lib/api-context';

const locales = ['de', 'en'] as const;

type Locale = (typeof locales)[number];

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

const localizedMetadata: Record<Locale, { title: string; description: string }> = {
  de: {
    title: 'cueq: Zeiterfassung, Abwesenheit und Dienstplanung',
    description: 'Zeiterfassung, Abwesenheit und Dienstplanung für Hochschulen',
  },
  en: {
    title: 'cueq: Time tracking, absence, and roster planning',
    description: 'Time tracking, absence, and roster planning for universities',
  },
};

/** Supplies locale-specific product identity without changing route behavior. */
export async function generateMetadata({
  params,
}: Pick<LocaleLayoutProps, 'params'>): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = locales.includes(rawLocale as Locale) ? (rawLocale as Locale) : 'de';
  return {
    applicationName: 'cueq',
    title: localizedMetadata[locale].title,
    description: localizedMetadata[locale].description,
    icons: { icon: '/icon.svg' },
  };
}

/** Renders a validated locale shell around all localized application routes. */
export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale: rawLocale } = await params;
  const locale = locales.includes(rawLocale as Locale) ? (rawLocale as Locale) : 'de';
  setRequestLocale(locale);

  const messages = (await import(`../../messages/${locale}.json`)).default;
  const altLocale = locale === 'de' ? 'en' : 'de';

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ApiProvider>
            <AppClientEffects locale={locale} />
            <AppWorkspace locale={locale} altLocale={altLocale} messages={messages.app}>
              {children}
            </AppWorkspace>
          </ApiProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
