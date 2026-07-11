'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useSessionContext } from '../../../components/AppWorkspace';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { PageShell } from '../../../components/PageShell';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';
import {
  ActionsSection,
  ChecklistSection,
  CorrectionSection,
  ExportsSection,
  PeriodListSection,
  PeriodQuerySection,
  PeriodStateSection,
} from './closing-sections';
import {
  useArtifactDownload,
  useClosingActions,
  useClosingPeriods,
  useOrganizationUnitScope,
} from './use-closing-workspace';

export default function ClosingPage() {
  const t = useTranslations('pages.closing');
  const params = useParams<{ locale: string }>();
  const locale = typeof params?.locale === 'string' ? params.locale : 'de';
  const { apiBaseUrl, setApiBaseUrl, token, setToken, apiRequest } = useApiContext();
  const { profile } = useSessionContext();
  const periods = useClosingPeriods(t, apiRequest);
  const actions = useClosingActions(t, apiRequest, periods.period, periods.loadPeriods);
  const download = useArtifactDownload(t, apiBaseUrl, token, periods.period);
  useOrganizationUnitScope(
    profile?.role,
    profile?.organizationUnitId,
    periods.setOrganizationUnitId,
  );
  const loading = periods.loading || actions.loading || download.loading;

  return (
    <PageShell
      title={t('title')}
      description={t('description')}
      breadcrumbs={[{ label: 'cueq', href: `/${locale}` }, { label: t('title') }]}
    >
      <ConnectionPanel
        apiBaseLabel={t('apiBaseLabel')}
        tokenLabel={t('tokenLabel')}
        apiBaseUrl={apiBaseUrl}
        setApiBaseUrl={setApiBaseUrl}
        token={token}
        setToken={setToken}
      />
      <PeriodQuerySection
        t={t}
        fromMonth={periods.fromMonth}
        toMonth={periods.toMonth}
        organizationUnitId={periods.organizationUnitId}
        organizationUnitLocked={profile?.role === 'TEAM_LEAD'}
        loading={loading}
        onFromMonthChange={periods.setFromMonth}
        onToMonthChange={periods.setToMonth}
        onOrganizationUnitChange={periods.setOrganizationUnitId}
        onLoadPeriods={() => void periods.loadPeriods()}
      />
      <StatusBanner
        message={actions.message ?? download.message ?? periods.message}
        error={actions.error ?? download.error ?? periods.error}
      />
      <div className="cq-workspace-split">
        <PeriodListSection
          t={t}
          periods={periods.periods}
          loading={loading}
          onSelectPeriod={(periodId) => void periods.selectPeriod(periodId)}
        />
        <div className="cq-workspace-detail">
          <PeriodStateSection t={t} period={periods.period} />
          <ActionsSection
            t={t}
            loading={loading}
            period={periods.period}
            exportFormat={actions.exportFormat}
            workflowReason={actions.workflowReason}
            onExportFormatChange={actions.setExportFormat}
            onRunPeriodAction={(pathSuffix, body) => void actions.runPeriodAction(pathSuffix, body)}
            role={profile?.role ?? null}
            checklist={periods.checklist}
          />
          <ChecklistSection t={t} checklist={periods.checklist} />
          <CorrectionSection
            t={t}
            loading={loading}
            period={periods.period}
            workflowId={actions.workflowId}
            workflowReason={actions.workflowReason}
            correctionPayload={actions.correctionPayload}
            onWorkflowIdChange={actions.setWorkflowId}
            onWorkflowReasonChange={actions.setWorkflowReason}
            onCorrectionPayloadChange={actions.setCorrectionPayload}
            onApproveWorkflow={() => void actions.approveWorkflow()}
            onApplyCorrection={() => void actions.applyCorrection()}
            role={profile?.role ?? null}
            workflowApproved={actions.workflowApproved}
          />
          <ExportsSection
            t={t}
            loading={loading}
            period={periods.period}
            onDownloadArtifact={(runId) => void download.downloadArtifact(runId)}
          />
        </div>
      </div>
    </PageShell>
  );
}
