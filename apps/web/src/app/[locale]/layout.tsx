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

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale: rawLocale } = await params;
  const locale = locales.includes(rawLocale as Locale) ? (rawLocale as Locale) : 'de';
  setRequestLocale(locale);

  const messages = (await import(`../../messages/${locale}.json`)).default;
  const altLocale = locale === 'de' ? 'en' : 'de';

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ApiProvider>
        <AppClientEffects locale={locale} />
        <AppWorkspace locale={locale} altLocale={altLocale} messages={messages.app}>
          {children}
        </AppWorkspace>
      </ApiProvider>
    </NextIntlClientProvider>
  );
}
