import {
  ClosingBookingCorrectionResponseSchema,
  ClosingExportResponseSchema,
  ClosingPeriodMutationResponseSchema,
  WorkflowInstanceSchema,
} from '@cueq/shared';
import type { ApiRequest, ApiResponseSchema } from '../../../lib/api-client';
import type { ClosingActionId } from './closing-action-policy';
import type { ApplyCorrectionPayload } from './closing-types';

export function responseSchemaForClosingAction(
  action: ClosingActionId,
): ApiResponseSchema<unknown> {
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

/** Runs a period mutation with the response schema and request shape required by that action. */
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

/** Extracts the workflow created by a post-close correction request, if the API returned one. */
export function createdCorrectionWorkflowId(
  action: ClosingActionId,
  result: unknown,
): string | undefined {
  if (action !== 'post-close-corrections' || !result || typeof result !== 'object')
    return undefined;
  return (result as { id?: string }).id;
}

/** Submits an approval decision for the workflow that permits a correction booking. */
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

/** Applies a correction booking exactly as represented by the correction form. */
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
