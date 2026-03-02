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
  const workforceLabel = locale === 'de' ? 'Mitarbeitende' : 'Workforce';
  const operationsLabel = locale === 'de' ? 'HR & Betrieb' : 'HR & Operations';

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ApiProvider>
        <div className="cq-app-shell">
          <aside className="cq-app-sidebar">
            <div className="cq-brand">
              <p className="cq-brand-overline">{locale === 'de' ? 'Universität NRW' : 'University NRW'}</p>
              <h1>{messages.app.title}</h1>
              <p>{messages.app.subtitle}</p>
            </div>

            <div className="cq-nav-block">
              <p className="cq-nav-group-title">{workforceLabel}</p>
              <nav className="cq-app-nav" aria-label={workforceLabel}>
                <Link className="cq-nav-link" href={`/${locale}/dashboard`}>
                  {messages.app.nav.dashboard}
                </Link>
                <Link className="cq-nav-link" href={`/${locale}/bookings`}>
                  {messages.app.nav.bookings}
                </Link>
                <Link className="cq-nav-link" href={`/${locale}/leave`}>
                  {messages.app.nav.leave}
                </Link>
                <Link className="cq-nav-link" href={`/${locale}/team-calendar`}>
                  {messages.app.nav.teamCalendar}
                </Link>
                <Link className="cq-nav-link" href={`/${locale}/roster`}>
                  {messages.app.nav.roster}
                </Link>
                <Link className="cq-nav-link" href={`/${locale}/oncall`}>
                  {messages.app.nav.oncall}
                </Link>
              </nav>
            </div>

            <div className="cq-nav-block">
              <p className="cq-nav-group-title">{operationsLabel}</p>
              <nav className="cq-app-nav" aria-label={operationsLabel}>
                <Link className="cq-nav-link" href={`/${locale}/approvals`}>
                  {messages.app.nav.approvals}
                </Link>
                <Link className="cq-nav-link" href={`/${locale}/closing`}>
                  {messages.app.nav.closing}
                </Link>
                <Link className="cq-nav-link" href={`/${locale}/reports`}>
                  {messages.app.nav.reports}
                </Link>
                <Link className="cq-nav-link" href={`/${locale}/policy-admin`}>
                  {messages.app.nav.policyAdmin}
                </Link>
                <Link className="cq-nav-link" href={`/${locale}/time-engine`}>
                  {messages.app.nav.timeEngine}
                </Link>
              </nav>
            </div>

            <div className="cq-locale-panel">
              <span>{messages.app.localeSwitch}</span>
              <Link className="cq-locale-switch" href={`/${altLocale}/dashboard`}>
                {altLocale.toUpperCase()}
              </Link>
            </div>
          </aside>

          <main className="cq-app-main">{children}</main>
        </div>
      </ApiProvider>
    </NextIntlClientProvider>
  );
}
