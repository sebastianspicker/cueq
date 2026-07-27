import Link from 'next/link';
import type { DashboardSummary, TranslationFn } from './types';

export function DashboardHero({
  t,
  locale,
  firstName,
  loading,
  summary,
  onLoad,
}: {
  t: TranslationFn;
  locale: string;
  firstName: string | null;
  loading: boolean;
  summary: DashboardSummary | null;
  onLoad: () => void;
}) {
  const displayDate = summary
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: 'full',
        timeZone: 'Europe/Berlin',
      }).format(new Date(summary.now))
    : null;

  return (
    <header className="cq-dashboard-hero">
      <div>
        <h1>{firstName ? t('greeting', { name: firstName }) : t('greetingFallback')}</h1>
        <p>{displayDate ?? t('description')}</p>
      </div>
      <div className="cq-dashboard-primary-actions">
        {summary ? null : (
          <button type="button" disabled={loading} onClick={onLoad}>
            {loading ? t('loading') : t('loadSummary')}
          </button>
        )}
        <Link href={`/${locale}/leave`}>{t('requestLeave')}</Link>
      </div>
    </header>
  );
}
