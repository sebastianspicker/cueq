import {
  ClosingBookingCorrectionResponseSchema,
  ClosingExportResponseSchema,
  ClosingPeriodMutationResponseSchema,
  WorkflowInstanceSchema,
} from '@cueq/contracts';
import type { ApiRequest, ApiResponseSchema } from '../../../platform/http/api-client';
import type { ClosingActionId } from './closing-action-policy';
import type { ApplyCorrectionPayload } from './closing-types';

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

export function requestClosingPeriodAction(
  apiRequest: ApiRequest,
  periodId: string,
  action: ClosingActionId,
  body?: unknown,
) {
  return apiRequest(
    `/v1/closing-periods/${periodId}/${action}`,
    responseSchemaForClosingAction(action),
    {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    },
  );
}

export function createdCorrectionWorkflowId(
  action: ClosingActionId,
  result: unknown,
): string | undefined {
  if (action !== 'post-close-corrections' || !result || typeof result !== 'object')
    return undefined;
  return (result as { id?: string }).id;
}

export function requestWorkflowApproval(
  apiRequest: ApiRequest,
  workflowId: string,
  reason: string,
) {
  return apiRequest(`/v1/workflows/${workflowId}/decision`, WorkflowInstanceSchema, {
    method: 'POST',
    body: JSON.stringify({ action: 'APPROVE', reason }),
  });
}

export function requestClosingCorrection(
  apiRequest: ApiRequest,
  periodId: string,
  payload: ApplyCorrectionPayload,
) {
  return apiRequest(
    `/v1/closing-periods/${periodId}/corrections/bookings`,
    ClosingBookingCorrectionResponseSchema,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}
