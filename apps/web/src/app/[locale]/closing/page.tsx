'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';

interface ClosingChecklistItem {
  code: string;
  label: string;
  severity: string;
  status: string;
  details: string;
}

interface ClosingChecklistResponse {
  closingPeriodId: string;
  status: string;
  hasErrors: boolean;
  items: ClosingChecklistItem[];
}

interface ExportRun {
  id: string;
  format: string;
  recordCount: number;
  checksum: string;
  exportedAt: string;
}

interface ClosingPeriod {
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

interface ApplyCorrectionPayload {
  workflowId: string;
  personId: string;
  timeTypeId: string;
  startTime: string;
  endTime: string;
  reason: string;
  note?: string;
}

export default function ClosingPage() {
  const t = useTranslations('pages.closing');
  const { apiBaseUrl, setApiBaseUrl, token, setToken, apiRequest } = useApiContext();
  const baseUrl = apiBaseUrl.replace(/\/$/, '');
  const [fromMonth, setFromMonth] = useState('2026-03');
  const [toMonth, setToMonth] = useState('2026-03');
  const [organizationUnitId, setOrganizationUnitId] = useState('');
  const [periods, setPeriods] = useState<ClosingPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClosingPeriod | null>(null);
  const [checklist, setChecklist] = useState<ClosingChecklistResponse | null>(null);
  const [workflowId, setWorkflowId] = useState('');
  const [workflowReason, setWorkflowReason] = useState('Payroll mismatch correction');
  const [exportFormat, setExportFormat] = useState<'CSV_V1' | 'XML_V1'>('CSV_V1');
  const [correctionPayload, setCorrectionPayload] = useState<ApplyCorrectionPayload>({
    workflowId: '',
    personId: '',
    timeTypeId: '',
    startTime: '2026-03-10T09:00:00.000Z',
    endTime: '2026-03-10T11:00:00.000Z',
    reason: 'Backfill missing booking after payroll check',
    note: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function selectedPeriod(): ClosingPeriod | null {
    if (!selectedPeriodId) {
      return null;
    }
    return periods.find((period) => period.id === selectedPeriodId) ?? detail;
  }

  async function loadPeriods() {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (fromMonth) {
        params.set('from', fromMonth);
      }
      if (toMonth) {
        params.set('to', toMonth);
      }
      if (organizationUnitId) {
        params.set('organizationUnitId', organizationUnitId);
      }

      const rows = await apiRequest<ClosingPeriod[]>(`/v1/closing-periods?${params.toString()}`);
      setPeriods(rows);
      if (rows.length === 0) {
        setSelectedPeriodId(null);
        setDetail(null);
        setChecklist(null);
        return;
      }

      const next =
        selectedPeriodId && rows.some((row) => row.id === selectedPeriodId)
          ? selectedPeriodId
          : rows[0]?.id;
      if (next) {
        await selectPeriod(next);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function selectPeriod(periodId: string) {
    setLoading(true);
    setError(null);
    try {
      setSelectedPeriodId(periodId);
      const [period, items] = await Promise.all([
        apiRequest<ClosingPeriod>(`/v1/closing-periods/${periodId}`),
        apiRequest<ClosingChecklistResponse>(`/v1/closing-periods/${periodId}/checklist`),
      ]);
      setDetail(period);
      setChecklist(items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function runPeriodAction(pathSuffix: string, body?: unknown) {
    const period = selectedPeriod();
    if (!period) {
      setError(t('selectPeriod'));
      return;
    }

    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const result = await apiRequest<unknown>(`/v1/closing-periods/${period.id}/${pathSuffix}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      if (pathSuffix === 'post-close-corrections' && result && typeof result === 'object') {
        const id = (result as { id?: string }).id;
        if (id) {
          setWorkflowId(id);
          setCorrectionPayload((current) => ({ ...current, workflowId: id }));
        }
      }

      await loadPeriods();
      setMessage(t('actionApplied'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function approveWorkflow() {
    if (!workflowId) {
      setError(t('workflowIdRequired'));
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/v1/workflows/${workflowId}/decision`, {
        method: 'POST',
        body: JSON.stringify({ action: 'APPROVE', reason: workflowReason }),
      });
      setMessage(t('workflowApproved'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function applyCorrection() {
    const period = selectedPeriod();
    if (!period) {
      setError(t('selectPeriod'));
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/v1/closing-periods/${period.id}/corrections/bookings`, {
        method: 'POST',
        body: JSON.stringify(correctionPayload),
      });
      await loadPeriods();
      setMessage(t('correctionApplied'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function downloadArtifact(runId: string) {
    const period = selectedPeriod();
    if (!period) {
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `${baseUrl}/v1/closing-periods/${period.id}/export-runs/${runId}/artifact`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || t('requestFailed'));
      }

      const artifact = await response.text();
      const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
      const filename =
        response.headers.get('content-disposition')?.match(/filename="([^"]+)"/u)?.[1] ??
        `payroll-export-${period.id}-${runId}.txt`;
      const blob = new Blob([artifact], { type: contentType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(t('downloadArtifactReady'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  const period = selectedPeriod();

  return (
    <PageShell title={t('title')} description={t('description')}>

      <ConnectionPanel
        apiBaseLabel={t('apiBaseLabel')}
        tokenLabel={t('tokenLabel')}
        apiBaseUrl={apiBaseUrl}
        setApiBaseUrl={setApiBaseUrl}
        token={token}
        setToken={setToken}
      />

      <SectionCard>
        <h2>{t('periodQueryTitle')}</h2>
        <div className="cq-grid-3">
          <label className="cq-form-field">
            <span>{t('fromMonth')}</span>
            <input
              type="month"
              value={fromMonth}
              onChange={(event) => setFromMonth(event.target.value)}
            />
          </label>
          <label className="cq-form-field">
            <span>{t('toMonth')}</span>
            <input
              type="month"
              value={toMonth}
              onChange={(event) => setToMonth(event.target.value)}
            />
          </label>
          <label className="cq-form-field">
            <span>{t('organizationUnitId')}</span>
            <input
              value={organizationUnitId}
              onChange={(event) => setOrganizationUnitId(event.target.value)}
            />
          </label>
        </div>
        <div className="cq-space-top-sm">
          <button type="button" disabled={loading} onClick={() => void loadPeriods()}>
            {loading ? t('loading') : t('loadPeriods')}
          </button>
        </div>
      </SectionCard>

      <StatusBanner message={message} error={error} />

      <SectionCard>
        <h2>{t('periodListTitle')}</h2>
        {periods.length === 0 ? (
          <p>{t('noPeriods')}</p>
        ) : (
          <ul className="cq-list-stack">
            {periods.map((row) => (
              <li
                key={row.id}
                className="cq-list-item"
              >
                <div>
                  <strong>{row.id}</strong> | {row.status}
                </div>
                <div>
                  {row.periodStart.slice(0, 10)} - {row.periodEnd.slice(0, 10)}
                </div>
                <button type="button" disabled={loading} onClick={() => void selectPeriod(row.id)}>
                  {t('details')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {period ? (
        <SectionCard>
          <h2>{t('stateLabel')}</h2>
          <p>
            <strong>{t('stateLabel')}:</strong> {period.status}
          </p>
          <p>
            <strong>{t('leadApprovalLabel')}:</strong> {period.leadApprovedAt ?? '—'}
          </p>
          <p>
            <strong>{t('hrApprovalLabel')}:</strong> {period.hrApprovedAt ?? '—'}
          </p>
          <p>
            <strong>{t('lockLabel')}:</strong> {period.lockedAt ?? '—'} ({period.lockSource ?? '—'})
          </p>
        </SectionCard>
      ) : null}

      <SectionCard>
        <h2>{t('actionsTitle')}</h2>
        <label
          style={{ display: 'grid', gap: '.25rem', marginBottom: '.75rem', maxWidth: '16rem' }}
        >
          <span>{t('exportFormatLabel')}</span>
          <select
            value={exportFormat}
            onChange={(event) => setExportFormat(event.target.value as 'CSV_V1' | 'XML_V1')}
          >
            <option value="CSV_V1">CSV_V1</option>
            <option value="XML_V1">XML_V1</option>
          </select>
        </label>
        <div className="cq-inline-actions">
          <button
            type="button"
            disabled={loading || !period}
            onClick={() => void runPeriodAction('start-review')}
          >
            {t('startReview')}
          </button>
          <button
            type="button"
            disabled={loading || !period}
            onClick={() => void runPeriodAction('lead-approve')}
          >
            {t('leadApprove')}
          </button>
          <button
            type="button"
            disabled={loading || !period}
            onClick={() => void runPeriodAction('approve')}
          >
            {t('approve')}
          </button>
          <button
            type="button"
            disabled={loading || !period}
            onClick={() =>
              void runPeriodAction('export', {
                format: exportFormat,
              })
            }
          >
            {t('export')}
          </button>
          <button
            type="button"
            disabled={loading || !period}
            onClick={() => void runPeriodAction('reopen')}
          >
            {t('reopen')}
          </button>
          <button
            type="button"
            disabled={loading || !period}
            onClick={() =>
              void runPeriodAction('post-close-corrections', { reason: workflowReason })
            }
          >
            {t('postCloseCorrection')}
          </button>
        </div>
      </SectionCard>

      <SectionCard>
        <h2>{t('checklistTitle')}</h2>
        {!checklist ? (
          <p>{t('noChecklist')}</p>
        ) : (
          <ul className="cq-list-stack">
            {checklist.items.map((item) => (
              <li key={item.code}>
                <strong>{item.label}</strong> [{item.severity}/{item.status}] - {item.details}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard>
        <h2>{t('correctionTitle')}</h2>
        <div className="cq-list-stack">
          <label className="cq-form-field">
            <span>{t('workflowIdLabel')}</span>
            <input value={workflowId} onChange={(event) => setWorkflowId(event.target.value)} />
          </label>
          <label className="cq-form-field">
            <span>{t('workflowReasonLabel')}</span>
            <input
              value={workflowReason}
              onChange={(event) => setWorkflowReason(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={loading || !workflowId}
            onClick={() => void approveWorkflow()}
          >
            {t('approveWorkflow')}
          </button>

          <label className="cq-form-field">
            <span>{t('personIdLabel')}</span>
            <input
              value={correctionPayload.personId}
              onChange={(event) =>
                setCorrectionPayload((current) => ({ ...current, personId: event.target.value }))
              }
            />
          </label>
          <label className="cq-form-field">
            <span>{t('timeTypeIdLabel')}</span>
            <input
              value={correctionPayload.timeTypeId}
              onChange={(event) =>
                setCorrectionPayload((current) => ({ ...current, timeTypeId: event.target.value }))
              }
            />
          </label>
          <label className="cq-form-field">
            <span>{t('startTimeLabel')}</span>
            <input
              value={correctionPayload.startTime}
              onChange={(event) =>
                setCorrectionPayload((current) => ({ ...current, startTime: event.target.value }))
              }
            />
          </label>
          <label className="cq-form-field">
            <span>{t('endTimeLabel')}</span>
            <input
              value={correctionPayload.endTime}
              onChange={(event) =>
                setCorrectionPayload((current) => ({ ...current, endTime: event.target.value }))
              }
            />
          </label>
          <label className="cq-form-field">
            <span>{t('reasonLabel')}</span>
            <input
              value={correctionPayload.reason}
              onChange={(event) =>
                setCorrectionPayload((current) => ({ ...current, reason: event.target.value }))
              }
            />
          </label>
          <button
            type="button"
            disabled={loading || !period}
            onClick={() => void applyCorrection()}
          >
            {t('applyCorrection')}
          </button>
        </div>
      </SectionCard>

      <SectionCard>
        <h2>{t('exportsTitle')}</h2>
        {!period || period.exportRuns.length === 0 ? (
          <p>{t('noExports')}</p>
        ) : (
          <ul className="cq-list-stack">
            {period.exportRuns.map((run) => (
              <li key={run.id}>
                {run.exportedAt} | {run.format} | {run.recordCount} | {run.checksum}
                <button
                  type="button"
                  style={{ marginLeft: '.5rem' }}
                  disabled={loading}
                  onClick={() => void downloadArtifact(run.id)}
                >
                  {t('downloadArtifact')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </PageShell>
  );
}
