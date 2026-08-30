import { ForbiddenException } from '@nestjs/common';
import { WorkflowType } from '@cueq/database';

export function validatePostCloseSelfApproval(
  actorId: string,
  workflow: { requesterId: string; type: string },
) {
  if (workflow.type === WorkflowType.POST_CLOSE_CORRECTION && workflow.requesterId === actorId) {
    throw new ForbiddenException('Post-close corrections cannot be self-approved.');
  }
}
