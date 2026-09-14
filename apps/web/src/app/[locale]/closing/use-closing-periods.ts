'use client';

import { useCallback, useMemo, useState } from 'react';
import type { useTranslations } from 'next-intl';
import { ClosingPeriodSchema } from '@cueq/contracts';
import { useReadRequests } from '../../../shared/workspace/use-read-requests';
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
  const reads = useReadRequests(apiRequest);
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
      const read = reads.begin('selection');
      setLoading(true);
      setError(null);
      try {
        const [nextPeriod, items] = await fetchPeriodSelection(read.request, periodId);
        if (!read.isCurrent()) return;
        applySelection(createPeriodSelection(periodId, nextPeriod, items));
      } catch (cause) {
        if (!read.isCurrent()) return;
        setError(cause instanceof Error ? cause.message : t('requestFailed'));
      } finally {
        if (read.isCurrent()) {
          read.finish();
          setLoading(false);
        }
      }
    },
    [apiRequest, applySelection, reads, t],
  );

  const loadPeriods = useCallback(
    async (preserveFeedback = false): Promise<RefreshResult> => {
      const read = reads.begin('selection', preserveFeedback);
      const apiRequest = read.request;
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
        if (!read.isCurrent()) return { ok: true };
        setPeriods(rows);
        const nextId = nextSelectedPeriodId(rows, selectedPeriodId);
        if (!nextId) {
          applySelection(clearPeriodSelection());
        } else {
          const [nextPeriod, items] = await fetchPeriodSelection(apiRequest, nextId);
          if (!read.isCurrent()) return { ok: true };
          applySelection(createPeriodSelection(nextId, nextPeriod, items));
        }
        return { ok: true };
      } catch (cause) {
        if (read.isCurrent() && !preserveFeedback) {
          setError(cause instanceof Error ? cause.message : t('requestFailed'));
        }
        return { ok: false, cause };
      } finally {
        if (read.isCurrent()) {
          read.finish();
          setLoading(false);
        }
      }
    },
    [
      apiRequest,
      applySelection,
      reads,
      fromMonth,
      organizationUnitId,
      selectedPeriodId,
      t,
      toMonth,
    ],
  );

  return {
    reads,
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
