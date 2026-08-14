import type { useTranslations } from 'next-intl';
import type { WorkflowAction } from './approvals-types';

type TranslationFn = ReturnType<typeof useTranslations>;
const EMPTY_VALUE = '-';

export function displayOptional(value: string | number | null | undefined): string | number {
  return value ?? EMPTY_VALUE;
}

export function statusLabel(t: TranslationFn, status: string): string {
  const labels: Record<string, string> = {
    ALL: t('valueAll'),
    DRAFT: t('statusDraft'),
    SUBMITTED: t('statusSubmitted'),
    PENDING: t('statusPending'),
    ESCALATED: t('statusEscalated'),
    APPROVED: t('statusApproved'),
    REJECTED: t('statusRejected'),
    CANCELLED: t('statusCancelled'),
  };
  return labels[status] ?? status;
}

export function typeLabel(t: TranslationFn, type: string): string {
  const labels: Record<string, string> = {
    ALL: t('valueAll'),
    LEAVE_REQUEST: t('typeLeaveRequest'),
    BOOKING_CORRECTION: t('typeBookingCorrection'),
    POST_CLOSE_CORRECTION: t('typePostCloseCorrection'),
    SHIFT_SWAP: t('typeShiftSwap'),
    OVERTIME_APPROVAL: t('typeOvertimeApproval'),
  };
  return labels[type] ?? type;
}

export function actionLabel(t: TranslationFn, action: WorkflowAction): string {
  const labels: Record<WorkflowAction, string> = {
    SUBMIT: t('actionSubmit'),
    APPROVE: t('actionApprove'),
    REJECT: t('actionReject'),
    DELEGATE: t('actionDelegate'),
    CANCEL: t('actionCancel'),
  };
  return labels[action];
}
