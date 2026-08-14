'use client';

/** Booking workspace for personal entries and correction requests; API policy remains authoritative. */

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PageShell } from '../../../components/PageShell';
import { BookingsWorkspaceSections } from './bookings-sections';
import { useBookingsWorkspace } from './use-bookings-workspace';

/** Hosts booking retrieval and correction-request mutation state. */
export default function BookingsPage() {
  const t = useTranslations('pages.bookings');
  const params = useParams<{ locale: string }>();
  const locale = typeof params?.locale === 'string' ? params.locale : 'de';
  const workspace = useBookingsWorkspace(t);

  return (
    <PageShell
      title={t('title')}
      description={t('description')}
      breadcrumbs={[{ label: 'cueq', href: `/${locale}` }, { label: t('title') }]}
    >
      <BookingsWorkspaceSections t={t} workspace={workspace} />
    </PageShell>
  );
}
