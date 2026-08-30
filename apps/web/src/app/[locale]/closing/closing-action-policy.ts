/** Derives closing UI affordances from role and period state; it is not an authorization boundary. */
import type { CueqRole } from '../../../components/AppWorkspace';
import type { ClosingChecklistResponse, ClosingPeriod } from './closing-types';

export type ClosingActionId =
  | 'lead-approve'
  | 'approve'
  | 'export'
  | 'reopen'
  | 'post-close-corrections';

export interface ClosingActionDescriptor {
  id: ClosingActionId;
  label: 'leadApprove' | 'approve' | 'export' | 'reopen' | 'postCloseCorrection';
  unavailableHintId: string;
  unavailableHint:
    | 'leadApproveUnavailable'
    | 'approveUnavailable'
    | 'exportUnavailable'
    | 'reopenUnavailable'
    | 'correctionRequestUnavailable';
  available: boolean;
  body?: unknown;
}

interface ClosingActionPolicyInput {
  role: CueqRole | null;
  period: ClosingPeriod | null;
  checklist: ClosingChecklistResponse | null;
  exportFormat: 'CSV_V1' | 'XML_V1';
  workflowReason: string;
}

export function canManageClosingPeriod(role: CueqRole | null): boolean {
  return role === 'TEAM_LEAD' || role === 'HR' || role === 'ADMIN';
}

export function hasHrClosingAuthority(role: CueqRole | null): boolean {
  return role === 'HR' || role === 'ADMIN';
}

/** Produces state-aware action descriptors for display; the server revalidates every action. */
export function createClosingActionDescriptors({
  role,
  period,
  checklist,
  exportFormat,
  workflowReason,
}: ClosingActionPolicyInput): ClosingActionDescriptor[] {
  const inReview = period?.status === 'REVIEW';
  const isHrAuthority = hasHrClosingAuthority(role);

  if (role === 'TEAM_LEAD') {
    return [
      {
        id: 'lead-approve',
        label: 'leadApprove',
        unavailableHintId: 'closing-lead-action-reason',
        unavailableHint: 'leadApproveUnavailable',
        available: inReview && !period?.leadApprovedAt,
      },
    ];
  }

  if (!isHrAuthority) {
    return [];
  }

  const status = period?.status ?? '';
  return [
    {
      id: 'approve',
      label: 'approve',
      unavailableHintId: 'closing-approve-action-reason',
      unavailableHint: 'approveUnavailable',
      available: inReview && Boolean(period?.leadApprovedAt) && checklist?.hasErrors === false,
    },
    {
      id: 'export',
      label: 'export',
      unavailableHintId: 'closing-export-action-reason',
      unavailableHint: 'exportUnavailable',
      available: status === 'APPROVED' || status === 'CLOSED',
      body: { format: exportFormat },
    },
    {
      id: 'reopen',
      label: 'reopen',
      unavailableHintId: 'closing-reopen-action-reason',
      unavailableHint: 'reopenUnavailable',
      available: status === 'REVIEW' || status === 'APPROVED',
    },
    {
      id: 'post-close-corrections',
      label: 'postCloseCorrection',
      unavailableHintId: 'closing-correction-action-reason',
      unavailableHint: 'correctionRequestUnavailable',
      available: status === 'EXPORTED',
      body: { reason: workflowReason },
    },
  ];
}
