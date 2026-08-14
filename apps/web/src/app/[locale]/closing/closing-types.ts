import type { useTranslations } from 'next-intl';

interface ClosingChecklistItem {
  code: string;
  label: string;
  severity: string;
  status: string;
  details: string;
}

export interface ClosingChecklistResponse {
  closingPeriodId: string;
  status: string;
  hasErrors: boolean;
  items: ClosingChecklistItem[];
}

interface ExportRun {
  id: string;
  format: string;
  recordCount: number;
  checksum: string;
  exportedAt: string;
}

export interface ClosingPeriod {
  id: string;
  organizationUnitId: string | null;
  periodStart: string;
  periodEnd: string;
  status: string;
  exportRuns: ExportRun[];
  leadApprovedAt?: string | null;
  leadApprovedById?: string | null;
  hrApprovedAt?: string | null;
  hrApprovedById?: string | null;
  lockedAt?: string | null;
  lockSource?: string | null;
}

export interface ApplyCorrectionPayload {
  workflowId: string;
  personId: string;
  timeTypeId: string;
  startTime: string;
  endTime: string;
  reason: string;
  note?: string;
}

export type TranslationFn = ReturnType<typeof useTranslations>;

export function checklistVariant(item: ClosingChecklistItem): 'ok' | 'error' | 'warn' | 'muted' {
  if (item.severity === 'ERROR' || item.status === 'FAIL') return 'error';
  if (item.severity === 'WARNING') return 'warn';
  if (item.status === 'OK' || item.status === 'PASS') return 'ok';
  return 'muted';
}

export function formatInstant(value: string | null | undefined, locale: string): string {
  if (!value) return '';
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  }).format(instant);
}

export function formatMonth(value: string, locale: string): string {
  const instant = new Date(`${value.slice(0, 7)}-01T00:00:00.000Z`);
  if (Number.isNaN(instant.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(instant);
}

export function compactIdentifier(value: string): string {
  return value.length > 18 ? `…${value.slice(-14)}` : value;
}

/** Resolves the selected period from the latest list while preferring refreshed detail. */
export function findSelectedPeriod(
  periods: ClosingPeriod[],
  selectedPeriodId: string | null,
  detail: ClosingPeriod | null,
): ClosingPeriod | null {
  if (!selectedPeriodId) return null;
  return periods.find((period) => period.id === selectedPeriodId) ?? detail;
}

/** Returns checklist totals used by the readiness strip. */
export function closingChecklistTotals(checklist: ClosingChecklistResponse | null) {
  const items = checklist?.items ?? [];
  const passed = items.filter((item) => checklistVariant(item) === 'ok').length;
  const attention = items.filter((item) => {
    const variant = checklistVariant(item);
    return variant === 'warn' || variant === 'error';
  }).length;
  return { total: items.length, passed, attention };
}
