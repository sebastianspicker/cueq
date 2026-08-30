'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DashboardWorkspace } from './dashboard-workspace';
import { useDashboardWorkspace } from './use-dashboard-workspace';

export default function DashboardPage() {
  const t = useTranslations('pages.dashboard');
  const params = useParams<{ locale: string }>();
  const locale = typeof params?.locale === 'string' ? params.locale : 'de';
  const workspace = useDashboardWorkspace(t, locale);

  return <DashboardWorkspace t={t} locale={locale} workspace={workspace} />;
}
