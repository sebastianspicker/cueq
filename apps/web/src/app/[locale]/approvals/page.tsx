import { getTranslations } from 'next-intl/server';

interface ApprovalsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function ApprovalsPage({ params }: ApprovalsPageProps) {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: 'pages.approvals',
  });

  return (
    <section>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>
    </section>
  );
}
