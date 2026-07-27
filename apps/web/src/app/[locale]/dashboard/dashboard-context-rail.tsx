import type { DashboardSummary, TranslationFn } from './types';

export function DashboardContextRail({
  t,
  locale,
  summary,
  formatHours,
}: {
  t: TranslationFn;
  locale: string;
  summary: DashboardSummary;
  formatHours: (value: number) => string;
}) {
  const periodLabel = summary.period
    ? new Intl.DateTimeFormat(locale, {
        month: 'long',
        year: 'numeric',
        timeZone: 'Europe/Berlin',
      }).format(new Date(summary.period.start))
    : null;

  return (
    <aside className="cq-dashboard-rail" aria-label={t('summaryTitle')}>
      <section className="cq-rail-panel cq-panel">
        <div className="cq-rail-panel-head cq-panel-head">
          <h2>{t('modelPanel')}</h2>
        </div>
        <div className="cq-rail-panel-body cq-panel-body">
          <p className="cq-model-name">{summary.modelName}</p>
          <dl className="cq-rail-kv">
            <div>
              <dt>{t('todayTargetHours')}</dt>
              <dd>{formatHours(summary.todayTargetHours)} h</dd>
            </div>
            <div>
              <dt>{t('currentBalanceHours')}</dt>
              <dd data-positive={summary.currentBalanceHours >= 0 || undefined}>
                {summary.currentBalanceHours > 0 ? '+' : ''}
                {formatHours(summary.currentBalanceHours)} h
              </dd>
            </div>
            <div>
              <dt>{t('todayBookingsCount')}</dt>
              <dd>{summary.todayBookingsCount}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="cq-rail-panel cq-panel">
        <div className="cq-rail-panel-head cq-panel-head">
          <h2>{t('workTimeAccount')}</h2>
        </div>
        <div className="cq-rail-panel-body cq-panel-body">
          <p className="cq-model-meta">{periodLabel ?? '—'}</p>
          <dl className="cq-rail-kv">
            <div>
              <dt>{t('currentBalanceHours')}</dt>
              <dd data-positive={summary.currentBalanceHours >= 0 || undefined}>
                {summary.currentBalanceHours > 0 ? '+' : ''}
                {formatHours(summary.currentBalanceHours)} h
              </dd>
            </div>
            <div>
              <dt>{t('todayTargetHours')}</dt>
              <dd>{formatHours(summary.todayTargetHours)} h</dd>
            </div>
          </dl>
          <p className="cq-rail-footnote">{t('privacyNote')}</p>
        </div>
      </section>
    </aside>
  );
}
