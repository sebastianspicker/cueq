import { NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import Link from 'next/link';

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
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 1.5rem',
          borderBottom: '1px solid #dbe3ee',
          backgroundColor: '#ffffff',
        }}
      >
        <nav style={{ display: 'flex', gap: '1rem' }}>
          <Link href={`/${locale}/dashboard`}>{messages.app.nav.dashboard}</Link>
          <Link href={`/${locale}/team-calendar`}>{messages.app.nav.teamCalendar}</Link>
          <Link href={`/${locale}/leave`}>{messages.app.nav.leave}</Link>
          <Link href={`/${locale}/roster`}>{messages.app.nav.roster}</Link>
          <Link href={`/${locale}/approvals`}>{messages.app.nav.approvals}</Link>
          <Link href={`/${locale}/time-engine`}>{messages.app.nav.timeEngine}</Link>
          <Link href={`/${locale}/closing`}>{messages.app.nav.closing}</Link>
          <Link href={`/${locale}/reports`}>{messages.app.nav.reports}</Link>
          <Link href={`/${locale}/policy-admin`}>{messages.app.nav.policyAdmin}</Link>
        </nav>
        <Link href={`/${altLocale}/dashboard`}>{altLocale.toUpperCase()}</Link>
      </header>
      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '1.5rem' }}>{children}</main>
    </NextIntlClientProvider>
  );
}
