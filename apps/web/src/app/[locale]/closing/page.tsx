'use client';

/** Composes the monthly-closing workspace from query, action, export, and correction state. */

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useSessionContext, type CueqRole } from '../../../components/AppWorkspace';
import { PageShell } from '../../../components/PageShell';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';
import {
  ActionsSection,
  ApprovalChainSection,
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

type TranslationFn = ReturnType<typeof useTranslations>;
type ClosingPeriodsState = ReturnType<typeof useClosingPeriods>;
type ClosingActionsState = ReturnType<typeof useClosingActions>;
type ArtifactDownloadState = ReturnType<typeof useArtifactDownload>;

interface ClosingWorkspaceProps {
  t: TranslationFn;
  locale: string;
  role: CueqRole | undefined;
  periods: ClosingPeriodsState;
  actions: ClosingActionsState;
  download: ArtifactDownloadState;
  loading: boolean;
}

function ClosingWorkspace({
  t,
  locale,
  role,
  periods,
  actions,
  download,
  loading,
}: ClosingWorkspaceProps) {
  return (
    <PageShell
      title={t('title')}
      description={t('description')}
      breadcrumbs={[{ label: 'cueq', href: `/${locale}` }, { label: t('title') }]}
      className="cq-closing-page"
      headerAside={
        <PeriodQuerySection
          t={t}
          locale={locale}
          fromMonth={periods.fromMonth}
          toMonth={periods.toMonth}
          organizationUnitId={periods.organizationUnitId}
          selectedOrganizationUnitId={periods.period?.organizationUnitId}
          organizationUnitLocked={role === 'TEAM_LEAD'}
          loading={loading}
          onFromMonthChange={periods.setFromMonth}
          onToMonthChange={periods.setToMonth}
          onOrganizationUnitChange={periods.setOrganizationUnitId}
          onLoadPeriods={() => void periods.loadPeriods()}
        />
      }
    >
      <StatusBanner
        message={actions.message ?? download.message ?? periods.message}
        error={actions.error ?? download.error ?? periods.error}
      />
      <PeriodListSection
        t={t}
        locale={locale}
        periods={periods.periods}
        selectedPeriod={periods.period}
        loading={loading}
        onSelectPeriod={(periodId) => void periods.selectPeriod(periodId)}
      />
      <PeriodStateSection t={t} period={periods.period} checklist={periods.checklist} />
      {periods.period ? (
        <div className="cq-closing-workspace">
          <div className="cq-closing-main-column">
            <ChecklistSection t={t} checklist={periods.checklist} />
            <div className="cq-closing-evidence-grid">
              <ApprovalChainSection t={t} locale={locale} period={periods.period} />
              <ExportsSection
                t={t}
                locale={locale}
                loading={loading}
                period={periods.period}
                onDownloadArtifact={(runId) => void download.downloadArtifact(runId)}
              />
            </div>
          </div>
          <ActionsSection
            t={t}
            locale={locale}
            loading={loading}
            period={periods.period}
            exportFormat={actions.exportFormat}
            workflowReason={actions.workflowReason}
            onExportFormatChange={actions.setExportFormat}
            onRunPeriodAction={(pathSuffix, body) => void actions.runPeriodAction(pathSuffix, body)}
            role={role ?? null}
            checklist={periods.checklist}
          />
        </div>
      ) : null}
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
        role={role ?? null}
        workflowApproved={actions.workflowApproved}
      />
    </PageShell>
  );
}

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
