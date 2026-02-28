import { getTranslations } from 'next-intl/server';

interface ClosingPageProps {
  params: Promise<{ locale: string }>;
}

export default async function ClosingPage({ params }: ClosingPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.closing' });

  return (
    <section>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>

      <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
        <label style={{ display: 'grid', gap: '.25rem', maxWidth: 260 }}>
          <span>{t('periodLabel')}</span>
          <input type="month" defaultValue="2026-03" readOnly />
        </label>

        <p>
          <strong>{t('stateLabel')}:</strong> REVIEW
        </p>

        <section>
          <h2>{t('actionsTitle')}</h2>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <button type="button" disabled>
              Start Review
            </button>
            <button type="button" disabled>
              Approve
            </button>
            <button type="button" disabled>
              Export
            </button>
            <button type="button" disabled>
              Re-open
            </button>
          </div>
        </section>

        <section>
          <h2>{t('checklistTitle')}</h2>
          <ul>
            <li>Missing bookings: 0</li>
            <li>Open corrections: 0</li>
            <li>Roster mismatches: 0</li>
          </ul>
        </section>

        <section>
          <h2>{t('exportsTitle')}</h2>
          <p>No export runs loaded.</p>
        </section>
      </div>
    </section>
  );
}
