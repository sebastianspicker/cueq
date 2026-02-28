import { getTranslations } from 'next-intl/server';

interface ReportsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function ReportsPage({ params }: ReportsPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.reports' });

  return (
    <section>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>

      <p
        style={{
          marginTop: '1rem',
          padding: '.75rem',
          border: '1px solid #d0d7de',
          borderRadius: '.5rem',
          backgroundColor: '#f8fafc',
        }}
      >
        {t('privacyNotice')}
      </p>

      <div
        style={{
          marginTop: '1rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
        }}
      >
        <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
          <h2>{t('teamAbsence')}</h2>
          <p>Aggregated and suppression-safe</p>
        </article>

        <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
          <h2>{t('oeOvertime')}</h2>
          <p>Aggregated and suppression-safe</p>
        </article>

        <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
          <h2>{t('closingCompletion')}</h2>
          <p>Process-level status only</p>
        </article>
      </div>
    </section>
  );
}
