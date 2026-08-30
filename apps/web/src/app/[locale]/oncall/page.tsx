'use client';

/** On-call planning workspace with client-side UX guards backed by API authorization. */

import { useTranslations } from 'next-intl';
import { OnCallWorkspace } from './oncall-workspace';
import { useOnCallWorkspace } from './use-oncall-workspace';

export default function OnCallPage() {
  const t = useTranslations('pages.oncall');
  const workspace = useOnCallWorkspace(t);

  return <OnCallWorkspace t={t} workspace={workspace} />;
}
