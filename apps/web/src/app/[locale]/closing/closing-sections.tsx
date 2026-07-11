'use client';

import type { useTranslations } from 'next-intl';
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

type TranslationFn = ReturnType<typeof useTranslations<'pages.closing'>>;

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
}: {
  t: TranslationFn;
  loading: boolean;
  period: ClosingPeriod | null;
  exportFormat: 'CSV_V1' | 'XML_V1';
  workflowReason: string;
  onExportFormatChange: (format: 'CSV_V1' | 'XML_V1') => void;
  onRunPeriodAction: (pathSuffix: string, body?: unknown) => void;
}) {
  return (
    <SectionCard>
      <h2>{t('actionsTitle')}</h2>
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
      <div className="cq-inline-actions">
        <button
          type="button"
          disabled={loading || !period}
          onClick={() => onRunPeriodAction('start-review')}
        >
          {t('startReview')}
        </button>
        <button
          type="button"
          disabled={loading || !period}
          onClick={() => onRunPeriodAction('lead-approve')}
        >
          {t('leadApprove')}
        </button>
        <button
          type="button"
          disabled={loading || !period}
          onClick={() => onRunPeriodAction('approve')}
        >
          {t('approve')}
        </button>
        <button
          type="button"
          disabled={loading || !period}
          onClick={() => onRunPeriodAction('export', { format: exportFormat })}
        >
          {t('export')}
        </button>
        <button
          type="button"
          disabled={loading || !period}
          onClick={() => onRunPeriodAction('reopen')}
        >
          {t('reopen')}
        </button>
        <button
          type="button"
          disabled={loading || !period}
          onClick={() => onRunPeriodAction('post-close-corrections', { reason: workflowReason })}
        >
          {t('postCloseCorrection')}
        </button>
      </div>
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

export function CorrectionSection({
  t,
  loading,
  period,
  workflowId,
  workflowReason,
  correctionPayload,
  onWorkflowIdChange,
  onWorkflowReasonChange,
  onCorrectionPayloadChange,
  onApproveWorkflow,
  onApplyCorrection,
}: {
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
}) {
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
        <button type="button" disabled={loading || !workflowId} onClick={onApproveWorkflow}>
          {t('approveWorkflow')}
        </button>
      </div>

      <hr className="cq-separator" />

      <div className="cq-grid-2">
        <label className="cq-form-field">
          <span>{t('personIdLabel')}</span>
          <input
            value={correctionPayload.personId}
            onChange={(event) =>
              onCorrectionPayloadChange({ ...correctionPayload, personId: event.target.value })
            }
          />
        </label>
        <label className="cq-form-field">
          <span>{t('timeTypeIdLabel')}</span>
          <input
            value={correctionPayload.timeTypeId}
            onChange={(event) =>
              onCorrectionPayloadChange({ ...correctionPayload, timeTypeId: event.target.value })
            }
          />
        </label>
        <label className="cq-form-field">
          <span>{t('startTimeLabel')}</span>
          <input
            value={correctionPayload.startTime}
            onChange={(event) =>
              onCorrectionPayloadChange({ ...correctionPayload, startTime: event.target.value })
            }
          />
        </label>
        <label className="cq-form-field">
          <span>{t('endTimeLabel')}</span>
          <input
            value={correctionPayload.endTime}
            onChange={(event) =>
              onCorrectionPayloadChange({ ...correctionPayload, endTime: event.target.value })
            }
          />
        </label>
        <label className="cq-form-field cq-full-span">
          <span>{t('reasonLabel')}</span>
          <input
            value={correctionPayload.reason}
            onChange={(event) =>
              onCorrectionPayloadChange({ ...correctionPayload, reason: event.target.value })
            }
          />
        </label>
      </div>
      <div className="cq-space-top-sm">
        <button type="button" disabled={loading || !period} onClick={onApplyCorrection}>
          {t('applyCorrection')}
        </button>
      </div>
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
                  <span>&middot;</span>
                  <span>{run.recordCount} records</span>
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
