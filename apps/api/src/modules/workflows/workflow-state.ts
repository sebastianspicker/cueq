/** Defines pure workflow-state predicates. */
import { WorkflowStatus } from '@cueq/database';

/** Identifies terminal workflow states that must not accept further decisions. */
export function isWorkflowFinal(status: WorkflowStatus): boolean {
  return (
    status === WorkflowStatus.APPROVED ||
    status === WorkflowStatus.REJECTED ||
    status === WorkflowStatus.CANCELLED
  );
}
