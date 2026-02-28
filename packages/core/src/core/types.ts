export type RuleViolationSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface RuleViolation {
  code: string;
  severity: RuleViolationSeverity;
  message: string;
  ruleId?: string;
  ruleName?: string;
  context?: Record<string, unknown>;
}

export interface DomainWarning {
  code: string;
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
