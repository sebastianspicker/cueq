'use client';

import type { useTranslations } from 'next-intl';
import type { CueqRole } from '../../../components/AppWorkspace';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';

export interface ClosingChecklistItem {
  code: string;
  label: string;
  severity: string;
  status: string;
  details: string;
}

export interface ClosingChecklistResponse {
  closingPeriodId: string;
  status: string;
  hasErrors: boolean;
  items: ClosingChecklistItem[];
}

export interface ExportRun {
  id: string;
  format: string;
  recordCount: number;
  checksum: string;
  exportedAt: string;
}

export interface ClosingPeriod {
  id: string;
  organizationUnitId: string | null;
  periodStart: string;
  periodEnd: string;
  status: string;
  exportRuns: ExportRun[];
  leadApprovedAt?: string | null;
  leadApprovedById?: string | null;
  hrApprovedAt?: string | null;
  hrApprovedById?: string | null;
  lockedAt?: string | null;
  lockSource?: string | null;
}

export interface ApplyCorrectionPayload {
  workflowId: string;
  personId: string;
  timeTypeId: string;
  startTime: string;
  endTime: string;
  reason: string;
  note?: string;
}

type TranslationFn = ReturnType<typeof useTranslations>;

function checklistSeverityClass(severity: string): string {
  if (severity === 'ERROR') {
    return 'cq-severity-error';
  }

  if (severity === 'WARNING') {
    return 'cq-severity-warning';
  }

  return 'cq-severity-info';
}

export function findSelectedPeriod(
  periods: ClosingPeriod[],
  selectedPeriodId: string | null,
  detail: ClosingPeriod | null,
): ClosingPeriod | null {
  if (!selectedPeriodId) {
    return null;
  }

  return periods.find((period) => period.id === selectedPeriodId) ?? detail;
}

export function PeriodQuerySection({
  t,
  fromMonth,
  toMonth,
  organizationUnitId,
  loading,
  onFromMonthChange,
  onToMonthChange,
  onOrganizationUnitChange,
  onLoadPeriods,
  organizationUnitLocked = false,
}: {
  t: TranslationFn;
  fromMonth: string;
  toMonth: string;
  organizationUnitId: string;
  loading: boolean;
  onFromMonthChange: (value: string) => void;
  onToMonthChange: (value: string) => void;
  onOrganizationUnitChange: (value: string) => void;
  onLoadPeriods: () => void;
  organizationUnitLocked?: boolean;
}) {
  return (
    <SectionCard>
      <h2>{t('periodQueryTitle')}</h2>
      <div className="cq-grid-3">
        <label className="cq-form-field">
          <span>{t('fromMonth')}</span>
          <input
            type="month"
            value={fromMonth}
            onChange={(event) => onFromMonthChange(event.target.value)}
          />
        </label>
        <label className="cq-form-field">
          <span>{t('toMonth')}</span>
          <input
            type="month"
            value={toMonth}
            onChange={(event) => onToMonthChange(event.target.value)}
          />
        </label>
        <label className="cq-form-field">
          <span>{t('organizationUnitId')}</span>
          <input
            value={organizationUnitId}
            disabled={organizationUnitLocked}
            onChange={(event) => onOrganizationUnitChange(event.target.value)}
          />
        </label>
      </div>
      <div className="cq-space-top-sm">
        <button type="button" disabled={loading} onClick={onLoadPeriods}>
          {loading ? t('loading') : t('loadPeriods')}
        </button>
      </div>
    </SectionCard>
  );
}

export function PeriodListSection({
  t,
  periods,
  loading,
  onSelectPeriod,
}: {
  t: TranslationFn;
  periods: ClosingPeriod[];
  loading: boolean;
  onSelectPeriod: (periodId: string) => void;
}) {
  return (
    <SectionCard>
      <h2>{t('periodListTitle')}</h2>
      {periods.length === 0 ? (
        <p>{t('noPeriods')}</p>
      ) : (
        <ul className="cq-list-stack">
          {periods.map((row) => (
            <li key={row.id} className="cq-list-item">
              <div className="cq-list-item-header">
                <div className="cq-list-item-meta">
                  <StatusBadge status={row.status} />
                  <span>
                    {row.periodStart.slice(0, 10)} &ndash; {row.periodEnd.slice(0, 10)}
                  </span>
                </div>
                <button
                  type="button"
                  className="cq-btn-secondary cq-btn-sm"
                  disabled={loading}
                  onClick={() => onSelectPeriod(row.id)}
                >
                  {t('details')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function PeriodStateSection({
  t,
  period,
}: {
  t: TranslationFn;
  period: ClosingPeriod | null;
}) {
  if (!period) {
    return null;
  }

  return (
    <SectionCard>
      <h2>{t('stateLabel')}</h2>
      <dl className="cq-kv-grid">
        <dt>{t('stateLabel')}</dt>
        <dd>
          <StatusBadge status={period.status} />
        </dd>
        <dt>{t('leadApprovalLabel')}</dt>
        <dd>{period.leadApprovedAt ?? '—'}</dd>
        <dt>{t('hrApprovalLabel')}</dt>
        <dd>{period.hrApprovedAt ?? '—'}</dd>
        <dt>{t('lockLabel')}</dt>
        <dd>
          {period.lockedAt ?? '—'} ({period.lockSource ?? '—'})
        </dd>
      </dl>
    </SectionCard>
  );
}

export function ActionsSection({
  t,
  loading,
  period,
  exportFormat,
  workflowReason,
  onExportFormatChange,
  onRunPeriodAction,
  role,
  checklist,
}: {
  t: TranslationFn;
  loading: boolean;
  period: ClosingPeriod | null;
  exportFormat: 'CSV_V1' | 'XML_V1';
  workflowReason: string;
  onExportFormatChange: (format: 'CSV_V1' | 'XML_V1') => void;
  onRunPeriodAction: (pathSuffix: string, body?: unknown) => void;
  role: CueqRole | null;
  checklist: ClosingChecklistResponse | null;
}) {
  if (role !== 'TEAM_LEAD' && role !== 'HR' && role !== 'ADMIN') {
    return null;
  }

  const inReview = period?.status === 'REVIEW';
  const canLeadApprove = role === 'TEAM_LEAD' && inReview && !period?.leadApprovedAt;
  const isHrAuthority = role === 'HR' || role === 'ADMIN';
  const canApprove =
    isHrAuthority && inReview && Boolean(period?.leadApprovedAt) && checklist?.hasErrors === false;
  const canExport = isHrAuthority && ['APPROVED', 'CLOSED'].includes(period?.status ?? '');
  const canReopen = isHrAuthority && ['REVIEW', 'APPROVED'].includes(period?.status ?? '');
  const canRequestCorrection = isHrAuthority && period?.status === 'EXPORTED';

  return (
    <SectionCard>
      <h2>{t('actionsTitle')}</h2>
      {isHrAuthority ? (
        <label className="cq-form-field" style={{ maxWidth: '16rem' }}>
          <span>{t('exportFormatLabel')}</span>
          <select
            value={exportFormat}
            onChange={(event) => onExportFormatChange(event.target.value as 'CSV_V1' | 'XML_V1')}
          >
            <option value="CSV_V1">CSV_V1</option>
            <option value="XML_V1">XML_V1</option>
          </select>
        </label>
      ) : null}
      <div className="cq-inline-actions">
        {role === 'TEAM_LEAD' ? (
          <button
            type="button"
            disabled={loading || !canLeadApprove}
            aria-describedby={!canLeadApprove ? 'closing-lead-action-reason' : undefined}
            onClick={() => onRunPeriodAction('lead-approve')}
          >
            {t('leadApprove')}
          </button>
        ) : null}
        {isHrAuthority ? (
          <>
            <button
              type="button"
              disabled={loading || !canApprove}
              aria-describedby={!canApprove ? 'closing-approve-action-reason' : undefined}
              onClick={() => onRunPeriodAction('approve')}
            >
              {t('approve')}
            </button>
            <button
              type="button"
              disabled={loading || !canExport}
              aria-describedby={!canExport ? 'closing-export-action-reason' : undefined}
              onClick={() => onRunPeriodAction('export', { format: exportFormat })}
            >
              {t('export')}
            </button>
            <button
              type="button"
              disabled={loading || !canReopen}
              aria-describedby={!canReopen ? 'closing-reopen-action-reason' : undefined}
              onClick={() => onRunPeriodAction('reopen')}
            >
              {t('reopen')}
            </button>
            <button
              type="button"
              disabled={loading || !canRequestCorrection}
              aria-describedby={
                !canRequestCorrection ? 'closing-correction-action-reason' : undefined
              }
              onClick={() =>
                onRunPeriodAction('post-close-corrections', { reason: workflowReason })
              }
            >
              {t('postCloseCorrection')}
            </button>
          </>
        ) : null}
      </div>
      {role === 'TEAM_LEAD' && !canLeadApprove ? (
        <p id="closing-lead-action-reason" className="cq-form-hint">
          {t('leadApproveUnavailable')}
        </p>
      ) : null}
      {isHrAuthority && !canApprove ? (
        <p id="closing-approve-action-reason" className="cq-form-hint">
          {t('approveUnavailable')}
        </p>
      ) : null}
      {isHrAuthority && !canExport ? (
        <p id="closing-export-action-reason" className="cq-form-hint">
          {t('exportUnavailable')}
        </p>
      ) : null}
      {isHrAuthority && !canReopen ? (
        <p id="closing-reopen-action-reason" className="cq-form-hint">
          {t('reopenUnavailable')}
        </p>
      ) : null}
      {isHrAuthority && !canRequestCorrection ? (
        <p id="closing-correction-action-reason" className="cq-form-hint">
          {t('correctionRequestUnavailable')}
        </p>
      ) : null}
    </SectionCard>
  );
}

export function ChecklistSection({
  t,
  checklist,
}: {
  t: TranslationFn;
  checklist: ClosingChecklistResponse | null;
}) {
  return (
    <SectionCard>
      <h2>{t('checklistTitle')}</h2>
      {!checklist ? (
        <p>{t('noChecklist')}</p>
      ) : (
        <ul className="cq-list-stack">
          {checklist.items.map((item) => (
            <li key={item.code} className={checklistSeverityClass(item.severity)}>
              <div className="cq-list-item-header">
                <strong>{item.label}</strong>
                <div className="cq-list-item-meta">
                  <StatusBadge status={item.severity} />
                  <StatusBadge status={item.status} />
                </div>
              </div>
              <p>{item.details}</p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

interface CorrectionSectionProps {
  t: TranslationFn;
  loading: boolean;
  period: ClosingPeriod | null;
  workflowId: string;
  workflowReason: string;
  correctionPayload: ApplyCorrectionPayload;
  onWorkflowIdChange: (value: string) => void;
  onWorkflowReasonChange: (value: string) => void;
  onCorrectionPayloadChange: (payload: ApplyCorrectionPayload) => void;
  onApproveWorkflow: () => void;
  onApplyCorrection: () => void;
  role: CueqRole | null;
  workflowApproved: boolean;
}

function CorrectionPayloadFields(props: CorrectionSectionProps) {
  const updatePayload = (change: Partial<ApplyCorrectionPayload>) =>
    props.onCorrectionPayloadChange({ ...props.correctionPayload, ...change });

  return (
    <div className="cq-grid-2">
      <label className="cq-form-field">
        <span>{props.t('personIdLabel')}</span>
        <input
          value={props.correctionPayload.personId}
          onChange={(event) => updatePayload({ personId: event.target.value })}
        />
      </label>
      <label className="cq-form-field">
        <span>{props.t('timeTypeIdLabel')}</span>
        <input
          value={props.correctionPayload.timeTypeId}
          onChange={(event) => updatePayload({ timeTypeId: event.target.value })}
        />
      </label>
      <label className="cq-form-field">
        <span>{props.t('startTimeLabel')}</span>
        <input
          value={props.correctionPayload.startTime}
          onChange={(event) => updatePayload({ startTime: event.target.value })}
        />
      </label>
      <label className="cq-form-field">
        <span>{props.t('endTimeLabel')}</span>
        <input
          value={props.correctionPayload.endTime}
          onChange={(event) => updatePayload({ endTime: event.target.value })}
        />
      </label>
      <label className="cq-form-field cq-full-span">
        <span>{props.t('reasonLabel')}</span>
        <input
          value={props.correctionPayload.reason}
          onChange={(event) => updatePayload({ reason: event.target.value })}
        />
      </label>
    </div>
  );
}

export function CorrectionSection(props: CorrectionSectionProps) {
  const {
    t,
    loading,
    period,
    workflowId,
    workflowReason,
    onWorkflowIdChange,
    onWorkflowReasonChange,
    onApproveWorkflow,
    onApplyCorrection,
    role,
    workflowApproved,
  } = props;
  if (role !== 'HR' && role !== 'ADMIN') {
    return null;
  }

  const canApproveWorkflow = period?.status === 'REVIEW' && Boolean(workflowId);
  const canApplyCorrection = period?.status === 'REVIEW' && workflowApproved;

  return (
    <SectionCard>
      <h2>{t('correctionTitle')}</h2>
      <div className="cq-grid-2">
        <label className="cq-form-field">
          <span>{t('workflowIdLabel')}</span>
          <input value={workflowId} onChange={(event) => onWorkflowIdChange(event.target.value)} />
        </label>
        <label className="cq-form-field">
          <span>{t('workflowReasonLabel')}</span>
          <input
            value={workflowReason}
            onChange={(event) => onWorkflowReasonChange(event.target.value)}
          />
        </label>
      </div>
      <div className="cq-space-top-sm">
        <button
          type="button"
          disabled={loading || !canApproveWorkflow}
          aria-describedby={!canApproveWorkflow ? 'closing-workflow-reason' : undefined}
          onClick={onApproveWorkflow}
        >
          {t('approveWorkflow')}
        </button>
      </div>
      {!canApproveWorkflow ? (
        <p id="closing-workflow-reason" className="cq-form-hint">
          {t('workflowApprovalUnavailable')}
        </p>
      ) : null}

      <hr className="cq-separator" />

      <CorrectionPayloadFields {...props} />
      <div className="cq-space-top-sm">
        <button
          type="button"
          disabled={loading || !canApplyCorrection}
          aria-describedby={!canApplyCorrection ? 'closing-apply-correction-reason' : undefined}
          onClick={onApplyCorrection}
        >
          {t('applyCorrection')}
        </button>
      </div>
      {!canApplyCorrection ? (
        <p id="closing-apply-correction-reason" className="cq-form-hint">
          {t('applyCorrectionUnavailable')}
        </p>
      ) : null}
    </SectionCard>
  );
}

export function ExportsSection({
  t,
  loading,
  period,
  onDownloadArtifact,
}: {
  t: TranslationFn;
  loading: boolean;
  period: ClosingPeriod | null;
  onDownloadArtifact: (runId: string) => void;
}) {
  return (
    <SectionCard>
      <h2>{t('exportsTitle')}</h2>
      {!period || period.exportRuns.length === 0 ? (
        <p>{t('noExports')}</p>
      ) : (
        <ul className="cq-list-stack">
          {period.exportRuns.map((run) => (
            <li key={run.id} className="cq-list-item">
              <div className="cq-list-item-header">
                <div className="cq-list-item-meta">
                  <StatusBadge status={run.format} variant="info" label={run.format} />
                  <span>{run.exportedAt}</span>
                  <span>{t('recordCount', { count: run.recordCount })}</span>
                </div>
                <button
                  type="button"
                  className="cq-btn-secondary cq-btn-sm"
                  disabled={loading}
                  onClick={() => onDownloadArtifact(run.id)}
                >
                  {t('downloadArtifact')}
                </button>
              </div>
              <p className="cq-mono">{run.checksum}</p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
