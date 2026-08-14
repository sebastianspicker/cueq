'use client';

/** Roster planning workspace; client controls are convenience guards and API policy is authoritative. */
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PageShell } from '../../../components/PageShell';
import { RosterWorkspace } from './roster-workspace';
import { useRosterWorkspace } from './use-roster-workspace';

/** Composes locale-aware route chrome around the roster workspace. */
export default function RosterPage() {
  const t = useTranslations('pages.roster');
  const params = useParams<{ locale: string }>();
  const locale = String(params?.locale ?? 'de');
  const workspace = useRosterWorkspace(t);

  return (
    <PageShell
      title={t('title')}
      description={t('description')}
      breadcrumbs={[{ label: 'cueq', href: `/${locale}` }, { label: t('title') }]}
    >
      <RosterWorkspace t={t} workspace={workspace} />
    </PageShell>
  );
}
