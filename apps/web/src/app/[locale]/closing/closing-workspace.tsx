'use client';

import { type useTranslations } from 'next-intl';
import { type CueqRole } from '../../../components/AppWorkspace';
import { PageShell } from '../../../components/PageShell';
import { StatusBanner } from '../../../components/StatusBanner';
import { ActionsSection, CorrectionSection } from './closing-action-sections';
import { ApprovalChainSection, ChecklistSection } from './closing-checklist-sections';
import { ExportsSection } from './closing-export-sections';
import {
  PeriodListSection,
  PeriodQuerySection,
  PeriodStateSection,
} from './closing-period-sections';
import type { useArtifactDownload } from './use-closing-artifact-download';
import type { useClosingActions } from './use-closing-actions';
import type { useClosingPeriods } from './use-closing-periods';

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

export function ClosingWorkspace({
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
