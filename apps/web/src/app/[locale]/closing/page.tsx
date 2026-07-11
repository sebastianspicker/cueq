'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  findSelectedPeriod,
  type ApplyCorrectionPayload,
  type ClosingChecklistResponse,
  type ClosingPeriod,
} from './closing-sections';

export default function ClosingPage() {
  const t = useTranslations('pages.closing');
  const params = useParams<{ locale: string }>();
  const locale = typeof params?.locale === 'string' ? params.locale : 'de';
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

  const period = findSelectedPeriod(periods, selectedPeriodId, detail);

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
        fromMonth={fromMonth}
        toMonth={toMonth}
        organizationUnitId={organizationUnitId}
        loading={loading}
        onFromMonthChange={setFromMonth}
        onToMonthChange={setToMonth}
        onOrganizationUnitChange={setOrganizationUnitId}
        onLoadPeriods={() => void loadPeriods()}
      />

      <StatusBanner message={message} error={error} />

      <PeriodListSection
        t={t}
        periods={periods}
        loading={loading}
        onSelectPeriod={(periodId) => void selectPeriod(periodId)}
      />
      <PeriodStateSection t={t} period={period} />
      <ActionsSection
        t={t}
        loading={loading}
        period={period}
        exportFormat={exportFormat}
        workflowReason={workflowReason}
        onExportFormatChange={setExportFormat}
        onRunPeriodAction={(pathSuffix, body) => void runPeriodAction(pathSuffix, body)}
      />
      <ChecklistSection t={t} checklist={checklist} />
      <CorrectionSection
        t={t}
        loading={loading}
        period={period}
        workflowId={workflowId}
        workflowReason={workflowReason}
        correctionPayload={correctionPayload}
        onWorkflowIdChange={setWorkflowId}
        onWorkflowReasonChange={setWorkflowReason}
        onCorrectionPayloadChange={setCorrectionPayload}
        onApproveWorkflow={() => void approveWorkflow()}
        onApplyCorrection={() => void applyCorrection()}
      />
      <ExportsSection
        t={t}
        loading={loading}
        period={period}
        onDownloadArtifact={(runId) => void downloadArtifact(runId)}
      />
    </PageShell>
  );
}
