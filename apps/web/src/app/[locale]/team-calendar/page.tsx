import { getTranslations } from 'next-intl/server';

interface TeamCalendarPageProps {
  params: Promise<{ locale: string }>;
}

export default async function TeamCalendarPage({ params }: TeamCalendarPageProps) {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: 'pages.teamCalendar',
  });

  return (
    <section>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>
    </section>
  );
}
