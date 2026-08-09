'use client';

import { useCallback, useMemo, useState } from 'react';
import type { useTranslations } from 'next-intl';
import type { ApiRequest } from '../../../lib/api-client';
import { ClosingChecklistResponseSchema, ClosingPeriodSchema } from '@cueq/shared';
import type { RefreshResult } from '../../../lib/mutation-refresh';
import {
  findSelectedPeriod,
  type ClosingChecklistResponse,
  type ClosingPeriod,
} from './closing-types';

type TranslationFn = ReturnType<typeof useTranslations>;

async function fetchPeriodSelection(apiRequest: ApiRequest, periodId: string) {
  return Promise.all([
    apiRequest(`/v1/closing-periods/${periodId}`, ClosingPeriodSchema),
    apiRequest(`/v1/closing-periods/${periodId}/checklist`, ClosingChecklistResponseSchema),
  ]);
}

/** Manages closing-period query state and refreshes selected-period detail from the API. */
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
        const rows = await apiRequest(
          `/v1/closing-periods?${query.toString()}`,
          ClosingPeriodSchema.array(),
        );
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
