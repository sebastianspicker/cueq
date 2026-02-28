import { getTranslations } from 'next-intl/server';

interface DashboardPageProps {
  params: Promise<{ locale: string }>;
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: 'pages.dashboard',
  });

  return (
    <section>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>
    </section>
  );
}
