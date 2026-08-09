export type WorkflowAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'DELEGATE' | 'CANCEL';

export interface WorkflowInboxItem {
  id: string;
  type: string;
  status: string;
  requesterId: string;
  approverId: string | null;
  reason: string | null;
  decisionReason?: string | null;
  dueAt?: string | null;
  escalationLevel?: number;
  isOverdue: boolean;
  availableActions: WorkflowAction[];
}

export const STATUS_FILTERS = [
  'ALL',
  'DRAFT',
  'SUBMITTED',
  'PENDING',
  'ESCALATED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const;

export const TYPE_FILTERS = [
  'ALL',
  'LEAVE_REQUEST',
  'BOOKING_CORRECTION',
  'POST_CLOSE_CORRECTION',
  'SHIFT_SWAP',
  'OVERTIME_APPROVAL',
] as const;
