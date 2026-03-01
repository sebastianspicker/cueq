import { NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
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
        <header className="cq-app-header">
          <nav className="cq-app-nav">
            <Link href={`/${locale}/dashboard`}>{messages.app.nav.dashboard}</Link>
            <Link href={`/${locale}/bookings`}>{messages.app.nav.bookings}</Link>
            <Link href={`/${locale}/team-calendar`}>{messages.app.nav.teamCalendar}</Link>
            <Link href={`/${locale}/leave`}>{messages.app.nav.leave}</Link>
            <Link href={`/${locale}/roster`}>{messages.app.nav.roster}</Link>
            <Link href={`/${locale}/oncall`}>{messages.app.nav.oncall}</Link>
            <Link href={`/${locale}/approvals`}>{messages.app.nav.approvals}</Link>
            <Link href={`/${locale}/time-engine`}>{messages.app.nav.timeEngine}</Link>
            <Link href={`/${locale}/closing`}>{messages.app.nav.closing}</Link>
            <Link href={`/${locale}/reports`}>{messages.app.nav.reports}</Link>
            <Link href={`/${locale}/policy-admin`}>{messages.app.nav.policyAdmin}</Link>
          </nav>
          <Link href={`/${altLocale}/dashboard`}>{altLocale.toUpperCase()}</Link>
        </header>
        <main className="cq-app-main">{children}</main>
      </ApiProvider>
    </NextIntlClientProvider>
  );
}
