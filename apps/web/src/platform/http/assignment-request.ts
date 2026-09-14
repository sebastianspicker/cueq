import type { ApiRequest } from './api-client';

import { assignmentRequestTarget } from './assignment-target';

export function createAssignmentRequest(
  request: ApiRequest,
  assignmentId: string | null,
  personId: string | null,
  requiredMessage: string,
): ApiRequest {
  return async (path, schema, init) => {
    let target;
    try {
      target = assignmentRequestTarget(path, init, assignmentId, personId);
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'ASSIGNMENT_REQUIRED')
        throw new Error(requiredMessage);
      throw cause;
    }
    return request(target.path, schema, target.init);
  };
}
