'use client';

import { PrepareTimeAccountsResultSchema } from '@cueq/contracts';
import { useState } from 'react';
import type { useTranslations } from 'next-intl';
import type { WorkspaceReadRequests } from '../../../shared/workspace/read-requests';
import type { ApiRequest } from '../../../platform/http/api-client';
import type { RefreshResult } from '../../../shared/workspace/mutation-refresh';
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
  reads: WorkspaceReadRequests,
) {
  const [preparedAccounts, setPreparedAccounts] = useState<ReturnType<
    typeof PrepareTimeAccountsResultSchema.parse
  > | null>(null);
  const [workflowId, setWorkflowId] = useState('');
  const [workflowReason, setWorkflowReason] = useState(t('workflowReasonDefault'));
  const [workflowApproved, setWorkflowApproved] = useState(false);
  const [exportFormat, setExportFormat] = useState<'CSV_V2' | 'XML_V2'>('CSV_V2');
  const [correctionPayload, setCorrectionPayload] = useState<ApplyCorrectionPayload>({
    workflowId: '',
    personId: '',
    timeTypeId: '',
    startTime: '2026-03-10T09:00:00.000Z',
    endTime: '2026-03-10T11:00:00.000Z',
    reason: t('correctionReasonDefault'),
    note: '',
  });
  const { loading, message, error, setError, runSavedAction } = useClosingActionFeedback(
    t,
    reload,
    reads,
  );

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

  const prepareAccounts = async () => {
    if (!period || period.status !== 'OPEN') return;
    setPreparedAccounts(null);
    await runSavedAction(
      () =>
        apiRequest(
          `/v1/closing-periods/${period.id}/prepare-accounts`,
          PrepareTimeAccountsResultSchema,
          { method: 'POST' },
        ),
      t('actionApplied'),
      (result) => setPreparedAccounts(PrepareTimeAccountsResultSchema.parse(result)),
    );
  };

  const approveWorkflow = async () => {
    if (!workflowId) return;
    await runSavedAction(
      () => requestWorkflowApproval(apiRequest, workflowId, workflowReason),
      t('workflowApproved'),
      () => setWorkflowApproved(true),
      false,
      false,
    );
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
    prepareAccounts,
    preparedAccounts,
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
