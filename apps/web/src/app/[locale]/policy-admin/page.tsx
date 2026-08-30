'use client';

/** Policy administration workspace; client role checks only guide UX, while the API authorizes changes. */

import { useTranslations } from 'next-intl';
import { PolicyAdminWorkspace } from './policy-admin-workspace';
import { usePolicyAdminWorkspace } from './use-policy-admin-workspace';

export default function PolicyAdminPage() {
  const t = useTranslations('pages.policyAdmin');
  const workspace = usePolicyAdminWorkspace(t);

  return <PolicyAdminWorkspace t={t} workspace={workspace} />;
}
