'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ApprovalsWorkspace } from './approvals-workspace';
import { useApprovalsWorkspace } from './use-approvals-workspace';

export default function ApprovalsPage() {
  const t = useTranslations('pages.approvals');
  const params = useParams<{ locale: string }>();
  const locale = typeof params?.locale === 'string' ? params.locale : 'de';
  const workspace = useApprovalsWorkspace();

  return <ApprovalsWorkspace t={t} locale={locale} workspace={workspace} />;
}
