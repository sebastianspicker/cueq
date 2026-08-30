'use client';

import { useTranslations } from 'next-intl';
import { AuditWorkspace } from './audit-workspace';
import { useAuditWorkspace } from './use-audit-workspace';

export default function AuditPage() {
  const t = useTranslations('pages.audit');
  const workspace = useAuditWorkspace();

  return <AuditWorkspace t={t} workspace={workspace} />;
}
