'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { useTranslations } from 'next-intl';
import type { ApiFetch, ApiRequest } from '../../../lib/api-client';
import { refreshAfterMutation, type RefreshResult } from '../../../lib/mutation-refresh';
import {
  findSelectedPeriod,
  type ApplyCorrectionPayload,
  type ClosingChecklistResponse,
  type ClosingPeriod,
} from './closing-sections';

type TranslationFn = ReturnType<typeof useTranslations>;

async function fetchPeriodSelection(apiRequest: ApiRequest, periodId: string) {
  return Promise.all([
    apiRequest<ClosingPeriod>(`/v1/closing-periods/${periodId}`),
    apiRequest<ClosingChecklistResponse>(`/v1/closing-periods/${periodId}/checklist`),
  ]);
}

export function useClosingPeriods(t: TranslationFn, apiRequest: ApiRequest) {
  const [fromMonth, setFromMonth] = useState('2026-03');
  const [toMonth, setToMonth] = useState('2026-03');
  const [organizationUnitId, setOrganizationUnitId] = useState('');
  const [periods, setPeriods] = useState<ClosingPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClosingPeriod | null>(null);
  const [checklist, setChecklist] = useState<ClosingChecklistResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const period = useMemo(
    () => findSelectedPeriod(periods, selectedPeriodId, detail),
    [detail, periods, selectedPeriodId],
  );

  const selectPeriod = useCallback(
    async (periodId: string) => {
      setLoading(true);
      setError(null);
      try {
        const [nextPeriod, items] = await fetchPeriodSelection(apiRequest, periodId);
        setSelectedPeriodId(periodId);
        setDetail(nextPeriod);
        setChecklist(items);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t('requestFailed'));
      } finally {
        setLoading(false);
      }
    },
    [apiRequest, t],
  );

  const loadPeriods = useCallback(
    async (preserveFeedback = false): Promise<RefreshResult> => {
      setLoading(true);
      if (!preserveFeedback) {
        setMessage(null);
        setError(null);
      }
      try {
        const query = new URLSearchParams();
        if (fromMonth) query.set('from', fromMonth);
        if (toMonth) query.set('to', toMonth);
        if (organizationUnitId) query.set('organizationUnitId', organizationUnitId);
        const rows = await apiRequest<ClosingPeriod[]>(`/v1/closing-periods?${query.toString()}`);
        setPeriods(rows);
        const nextId = rows.some((row) => row.id === selectedPeriodId)
          ? selectedPeriodId
          : rows[0]?.id;
        if (!nextId) {
          setSelectedPeriodId(null);
          setDetail(null);
          setChecklist(null);
        } else {
          const [nextPeriod, items] = await fetchPeriodSelection(apiRequest, nextId);
          setSelectedPeriodId(nextId);
          setDetail(nextPeriod);
          setChecklist(items);
        }
        return { ok: true };
      } catch (cause) {
        if (!preserveFeedback) {
          setError(cause instanceof Error ? cause.message : t('requestFailed'));
        }
        return { ok: false, cause };
      } finally {
        setLoading(false);
      }
    },
    [apiRequest, fromMonth, organizationUnitId, selectedPeriodId, t, toMonth],
  );

  return {
    fromMonth,
    setFromMonth,
    toMonth,
    setToMonth,
    organizationUnitId,
    setOrganizationUnitId,
    periods,
    period,
    checklist,
    loading,
    message,
    setMessage,
    error,
    setError,
    selectPeriod,
    loadPeriods,
  };
}

export function useClosingActions(
  t: TranslationFn,
  apiRequest: ApiRequest,
  period: ClosingPeriod | null,
  reload: (preserveFeedback?: boolean) => Promise<RefreshResult>,
) {
  const [workflowId, setWorkflowId] = useState('');
  const [workflowReason, setWorkflowReason] = useState('Payroll mismatch correction');
  const [workflowApproved, setWorkflowApproved] = useState(false);
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

  const runPeriodAction = async (pathSuffix: string, body?: unknown) => {
    if (!period) {
      setError(t('selectPeriod'));
      return;
    }
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      let result: unknown;
      const refresh = await refreshAfterMutation(
        async () => {
          result = await apiRequest<unknown>(`/v1/closing-periods/${period.id}/${pathSuffix}`, {
            method: 'POST',
            body: body ? JSON.stringify(body) : undefined,
          });
        },
        () => reload(true),
      );
      const createdId =
        pathSuffix === 'post-close-corrections' && result && typeof result === 'object'
          ? (result as { id?: string }).id
          : undefined;
      if (createdId) {
        setWorkflowId(createdId);
        setWorkflowApproved(false);
        setCorrectionPayload((current) => ({ ...current, workflowId: createdId }));
      }
      if (refresh.ok) {
        setMessage(t('actionApplied'));
      } else {
        setError(t('savedRefreshFailed'));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  };

  const approveWorkflow = async () => {
    if (!workflowId) return;
    setLoading(true);
    setError(null);
    try {
      await apiRequest(`/v1/workflows/${workflowId}/decision`, {
        method: 'POST',
        body: JSON.stringify({ action: 'APPROVE', reason: workflowReason }),
      });
      setWorkflowApproved(true);
      setMessage(t('workflowApproved'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  };

  const applyCorrection = async () => {
    if (!period) return;
    setLoading(true);
    setError(null);
    try {
      const refresh = await refreshAfterMutation(
        () =>
          apiRequest(`/v1/closing-periods/${period.id}/corrections/bookings`, {
            method: 'POST',
            body: JSON.stringify(correctionPayload),
          }),
        () => reload(true),
      );
      if (refresh.ok) {
        setMessage(t('correctionApplied'));
      } else {
        setError(t('savedRefreshFailed'));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  };

  return {
    workflowId,
    setWorkflowId,
    workflowReason,
    setWorkflowReason,
    workflowApproved,
    exportFormat,
    setExportFormat,
    correctionPayload,
    setCorrectionPayload,
    loading,
    message,
    error,
    runPeriodAction,
    approveWorkflow,
    applyCorrection,
  };
}

export function useOrganizationUnitScope(
  role: string | undefined,
  profileOrganizationUnitId: string | undefined,
  setOrganizationUnitId: (value: string) => void,
) {
  useEffect(() => {
    if (role === 'TEAM_LEAD' && profileOrganizationUnitId) {
      setOrganizationUnitId(profileOrganizationUnitId);
    }
  }, [profileOrganizationUnitId, role, setOrganizationUnitId]);
}

export function useArtifactDownload(
  t: TranslationFn,
  apiFetch: ApiFetch,
  period: ClosingPeriod | null,
) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const downloadArtifact = async (runId: string) => {
    if (!period) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await apiFetch(
        `/v1/closing-periods/${period.id}/export-runs/${runId}/artifact`,
      );
      if (!response.ok) throw new Error(t('requestFailed'));
      const artifact = await response.text();
      const filename =
        response.headers.get('content-disposition')?.match(/filename="([^"]+)"/u)?.[1] ??
        `payroll-export-${period.id}-${runId}.txt`;
      const blob = new Blob([artifact], {
        type: response.headers.get('content-type') ?? 'application/octet-stream',
      });
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
  };

  return { loading, message, error, downloadArtifact };
}
