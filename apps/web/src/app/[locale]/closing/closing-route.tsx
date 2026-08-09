'use client';

/** Composes the monthly-closing workspace from query, action, export, and correction state. */

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useSessionContext } from '../../../components/AppWorkspace';
import { useApiContext } from '../../../lib/api-context';
import { ClosingWorkspace } from './closing-workspace';
import { useArtifactDownload } from './use-closing-artifact-download';
import { useClosingActions } from './use-closing-actions';
import { useClosingPeriods } from './use-closing-periods';
import { useOrganizationUnitScope } from './use-closing-organization-scope';

/** Connects the closing hooks to the localized closing workspace. */
export default function ClosingPage() {
  const t = useTranslations('pages.closing');
  const params = useParams<{ locale: string }>();
  const locale = typeof params?.locale === 'string' ? params.locale : 'de';
  const { apiFetch, apiRequest } = useApiContext();
  const { profile } = useSessionContext();
  const periods = useClosingPeriods(t, apiRequest);
  const actions = useClosingActions(t, apiRequest, periods.period, periods.loadPeriods);
  const download = useArtifactDownload(t, apiFetch, periods.period);
  useOrganizationUnitScope(
    profile?.role,
    profile?.organizationUnitId,
    periods.setOrganizationUnitId,
  );
  const loading = periods.loading || actions.loading || download.loading;

  return (
    <ClosingWorkspace
      t={t}
      locale={locale}
      role={profile?.role}
      periods={periods}
      actions={actions}
      download={download}
      loading={loading}
    />
  );
}
