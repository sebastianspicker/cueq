import { getTranslations } from 'next-intl/server';

interface RosterPageProps {
  params: Promise<{ locale: string }>;
}

export default async function RosterPage({ params }: RosterPageProps) {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: 'pages.roster',
  });

  return (
    <section>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>
    </section>
  );
}
