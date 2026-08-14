'use client';

import { useState } from 'react';
import type { useTranslations } from 'next-intl';
import type { ApiRequest } from '../../../lib/api-client';
import type { RefreshResult } from '../../../lib/mutation-refresh';
import type { ClosingActionId } from './closing-action-policy';
import { type ApplyCorrectionPayload, type ClosingPeriod } from './closing-types';
import {
  createdCorrectionWorkflowId,
  requestClosingCorrection,
  requestClosingPeriodAction,
  requestWorkflowApproval,
} from './closing-action-requests';
import { useClosingActionFeedback } from './use-closing-action-feedback';

type TranslationFn = ReturnType<typeof useTranslations>;

/** Performs closing actions with local feedback; role checks are UX only and the API authorizes each action. */
export function useClosingActions(
  t: TranslationFn,
  apiRequest: ApiRequest,
  period: ClosingPeriod | null,
  reload: (preserveFeedback?: boolean) => Promise<RefreshResult>,
) {
  const [workflowId, setWorkflowId] = useState('');
  const [workflowReason, setWorkflowReason] = useState(t('workflowReasonDefault'));
  const [workflowApproved, setWorkflowApproved] = useState(false);
  const [exportFormat, setExportFormat] = useState<'CSV_V1' | 'XML_V1'>('CSV_V1');
  const [correctionPayload, setCorrectionPayload] = useState<ApplyCorrectionPayload>({
    workflowId: '',
    personId: '',
    timeTypeId: '',
    startTime: '2026-03-10T09:00:00.000Z',
    endTime: '2026-03-10T11:00:00.000Z',
    reason: t('correctionReasonDefault'),
    note: '',
  });
  const { loading, message, error, setLoading, setMessage, setError, runSavedAction } =
    useClosingActionFeedback(t, reload);

  const runPeriodAction = async (pathSuffix: ClosingActionId, body?: unknown) => {
    if (!period) {
      setError(t('selectPeriod'));
      return;
    }
    await runSavedAction(
      () => requestClosingPeriodAction(apiRequest, period.id, pathSuffix, body),
      t('actionApplied'),
      (result) => {
        const createdId = createdCorrectionWorkflowId(pathSuffix, result);
        if (createdId) {
          setWorkflowId(createdId);
          setWorkflowApproved(false);
          setCorrectionPayload((current) => ({ ...current, workflowId: createdId }));
        }
      },
    );
  };

  const approveWorkflow = async () => {
    if (!workflowId) return;
    setLoading(true);
    setError(null);
    try {
      await requestWorkflowApproval(apiRequest, workflowId, workflowReason);
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
    await runSavedAction(
      () => requestClosingCorrection(apiRequest, period.id, correctionPayload),
      t('correctionApplied'),
      undefined,
      false,
    );
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
