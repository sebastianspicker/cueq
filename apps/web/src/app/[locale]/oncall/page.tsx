'use client';

/** On-call planning workspace with client-side UX guards backed by API authorization. */

import { useTranslations } from 'next-intl';
import { OnCallWorkspace } from './oncall-workspace';
import { useOnCallWorkspace } from './use-oncall-workspace';

/** Hosts on-call planning data, mutations, and local feedback. */
export default function OnCallPage() {
  const t = useTranslations('pages.oncall');
  const workspace = useOnCallWorkspace(t);

  return <OnCallWorkspace t={t} workspace={workspace} />;
}
