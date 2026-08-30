'use client';

import { useCallback, useMemo, useState } from 'react';
import type { useTranslations } from 'next-intl';
import { ClosingPeriodSchema } from '@cueq/contracts';
import type { ApiRequest } from '../../../platform/http/api-client';
import type { RefreshResult } from '../../../shared/workspace/mutation-refresh';
import {
  findSelectedPeriod,
  type ClosingChecklistResponse,
  type ClosingPeriod,
} from './closing-types';
import {
  clearPeriodSelection,
  closingPeriodsPath,
  createPeriodSelection,
  fetchPeriodSelection,
  nextSelectedPeriodId,
  type ClosingPeriodSelection,
} from './closing-period-selection';

type TranslationFn = ReturnType<typeof useTranslations>;

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

  const applySelection = useCallback((selection: ClosingPeriodSelection) => {
    setSelectedPeriodId(selection.selectedPeriodId);
    setDetail(selection.detail);
    setChecklist(selection.checklist);
  }, []);

  const selectPeriod = useCallback(
    async (periodId: string) => {
      setLoading(true);
      setError(null);
      try {
        const [nextPeriod, items] = await fetchPeriodSelection(apiRequest, periodId);
        applySelection(createPeriodSelection(periodId, nextPeriod, items));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t('requestFailed'));
      } finally {
        setLoading(false);
      }
    },
    [apiRequest, applySelection, t],
  );

  const loadPeriods = useCallback(
    async (preserveFeedback = false): Promise<RefreshResult> => {
      setLoading(true);
      if (!preserveFeedback) {
        setMessage(null);
        setError(null);
      }
      try {
        const rows = await apiRequest(
          closingPeriodsPath({ fromMonth, toMonth, organizationUnitId }),
          ClosingPeriodSchema.array(),
        );
        setPeriods(rows);
        const nextId = nextSelectedPeriodId(rows, selectedPeriodId);
        if (!nextId) {
          applySelection(clearPeriodSelection());
        } else {
          const [nextPeriod, items] = await fetchPeriodSelection(apiRequest, nextId);
          applySelection(createPeriodSelection(nextId, nextPeriod, items));
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
    [apiRequest, applySelection, fromMonth, organizationUnitId, selectedPeriodId, t, toMonth],
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
