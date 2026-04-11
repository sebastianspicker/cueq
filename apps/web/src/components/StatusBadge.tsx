type BadgeVariant = 'ok' | 'error' | 'warn' | 'info' | 'muted' | 'neutral';

const STATUS_MAP: Record<string, BadgeVariant> = {
  // Approval / workflow statuses
  APPROVED: 'ok',
  PUBLISHED: 'ok',
  CLOSED: 'muted',
  EXPORTED: 'ok',
  COMPLETED: 'ok',
  COMPLIANT: 'ok',

  PENDING: 'warn',
  SUBMITTED: 'warn',
  ESCALATED: 'warn',
  REVIEW: 'warn',
  IN_REVIEW: 'warn',

  REJECTED: 'error',
  CANCELLED: 'muted',
  OVERDUE: 'error',

  DRAFT: 'info',
  OPEN: 'info',
  REQUESTED: 'info',

  // Boolean / compliance
  true: 'ok',
  false: 'error',
  YES: 'ok',
  NO: 'error',

  // Severity levels
  ERROR: 'error',
  WARNING: 'warn',
  INFO: 'info',
  OK: 'ok',
  PASS: 'ok',
  FAIL: 'error',
};

const variantClass: Record<BadgeVariant, string> = {
  ok: 'cq-badge cq-badge-ok',
  error: 'cq-badge cq-badge-error',
  warn: 'cq-badge cq-badge-warn',
  info: 'cq-badge cq-badge-info',
  muted: 'cq-badge cq-badge-muted',
  neutral: 'cq-badge cq-badge-neutral',
};

interface StatusBadgeProps {
  status: string;
  variant?: BadgeVariant;
  label?: string;
}

export function StatusBadge({ status, variant, label }: StatusBadgeProps) {
  const resolved = variant ?? STATUS_MAP[status.toUpperCase()] ?? 'neutral';
  return <span className={variantClass[resolved]}>{label ?? status}</span>;
}
