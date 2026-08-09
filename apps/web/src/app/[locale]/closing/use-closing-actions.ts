'use client';

import { useState } from 'react';
import type { useTranslations } from 'next-intl';
import type { ApiRequest, ApiResponseSchema } from '../../../lib/api-client';
import {
  ClosingBookingCorrectionResponseSchema,
  ClosingExportResponseSchema,
  ClosingPeriodMutationResponseSchema,
  WorkflowInstanceSchema,
} from '@cueq/shared';
import { refreshAfterMutation, type RefreshResult } from '../../../lib/mutation-refresh';
import type { ClosingActionId } from './closing-action-policy';
import { type ApplyCorrectionPayload, type ClosingPeriod } from './closing-types';

type TranslationFn = ReturnType<typeof useTranslations>;

function responseSchemaForClosingAction(action: ClosingActionId): ApiResponseSchema<unknown> {
  switch (action) {
    case 'export':
      return ClosingExportResponseSchema;
    case 'post-close-corrections':
      return WorkflowInstanceSchema;
    case 'lead-approve':
    case 'approve':
    case 'reopen':
      return ClosingPeriodMutationResponseSchema;
  }
}

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
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSavedAction = async (
    mutate: () => Promise<unknown>,
    successMessage: string,
    onMutationResult?: (result: unknown) => void,
    clearMessage = true,
  ) => {
    setLoading(true);
    if (clearMessage) setMessage(null);
    setError(null);
    try {
      const refresh = await refreshAfterMutation(
        async () => {
          const result = await mutate();
          onMutationResult?.(result);
        },
        () => reload(true),
      );
      if (refresh.ok) {
        setMessage(successMessage);
      } else {
        setError(t('savedRefreshFailed'));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  };

  const runPeriodAction = async (pathSuffix: ClosingActionId, body?: unknown) => {
    if (!period) {
      setError(t('selectPeriod'));
      return;
    }
    await runSavedAction(
      () =>
        apiRequest(
          `/v1/closing-periods/${period.id}/${pathSuffix}`,
          responseSchemaForClosingAction(pathSuffix),
          {
            method: 'POST',
            body: body ? JSON.stringify(body) : undefined,
          },
        ),
      t('actionApplied'),
      (result) => {
        const createdId =
          pathSuffix === 'post-close-corrections' && result && typeof result === 'object'
            ? (result as { id?: string }).id
            : undefined;
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
      await apiRequest(`/v1/workflows/${workflowId}/decision`, WorkflowInstanceSchema, {
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
    await runSavedAction(
      () =>
        apiRequest(
          `/v1/closing-periods/${period.id}/corrections/bookings`,
          ClosingBookingCorrectionResponseSchema,
          {
            method: 'POST',
            body: JSON.stringify(correctionPayload),
          },
        ),
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
