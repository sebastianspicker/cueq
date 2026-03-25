export type RuleViolationSeverity = 'ERROR' | 'WARNING' | 'INFO';

/** Known violation codes emitted by the core domain. */
export type ViolationCode =
  | 'INVALID_INTERVAL'
  | 'BREAK_DEFICIT'
  | 'REST_HOURS_DEFICIT'
  | 'MAX_DAILY_HOURS_EXCEEDED'
  | 'MAX_WEEKLY_HOURS_EXCEEDED'
  | 'ONCALL_REST_DEFICIT'
  | 'INVALID_SHIFT_INTERVAL'
  | 'INVALID_TRANSITION'
  | 'INVALID_CLOSING_TRANSITION'
  | 'CHECKLIST_NOT_GREEN'
  | 'ROLE_FORBIDDEN'
  | 'UNSUPPORTED_ACTION'
  | 'NEGATIVE_WEEKLY_HOURS'
  | 'OVERLAP';

/** Known warning codes emitted by the core domain. */
export type WarningCode = 'MAX_DAILY_HOURS_EXTENDED_RANGE';

/** Typed context payloads for specific violation codes. */
export interface ViolationContextMap {
  BREAK_DEFICIT: { day: string; requiredBreakMinutes: number; breakMinutes: number };
  REST_HOURS_DEFICIT: { previousEnd: string; nextStart: string; restHours: number };
  MAX_DAILY_HOURS_EXCEEDED: { day: string; workedHours: number };
  INVALID_INTERVAL: { start: string; end: string; type: string };
  ONCALL_REST_DEFICIT: { previousEnd: string; nextStart: string; gapHours: number };
  INVALID_SHIFT_INTERVAL: { start: string; end: string };
  INVALID_TRANSITION: { workflowId?: string; actorId?: string; reason?: string | null };
}

export interface RuleViolation {
  code: ViolationCode | (string & {});
  severity: RuleViolationSeverity;
  message: string;
  ruleId?: string;
  ruleName?: string;
  context?: Record<string, unknown>;
}

export interface DomainWarning {
  code: WarningCode | (string & {});
  message: string;
  context?: Record<string, unknown>;
}

export type PlausibilityIssueCode =
  | 'OVERLAP'
  | 'NEGATIVE_DURATION'
  | 'MISSING_END'
  | 'INVALID_INTERVAL';

export interface PlausibilityIssue {
  code: PlausibilityIssueCode;
  severity: 'ERROR' | 'WARNING';
  message: string;
  index?: number;
  context?: Record<string, unknown>;
}

export type ChecklistSeverity = 'ERROR' | 'WARNING' | 'INFO';

export type ChecklistStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface ChecklistItem {
  code: string;
  label: string;
  severity: ChecklistSeverity;
  status: ChecklistStatus;
  details?: string;
}

export interface AuditEntryDraft {
  id: string;
  timestamp: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends Array<infer U>
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;
