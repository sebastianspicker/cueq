/** Client-side report-visibility hint; sensitive-report access is always enforced by the API. */
const SENSITIVE_REPORT_ROLES = new Set(['HR', 'ADMIN', 'DATA_PROTECTION', 'WORKS_COUNCIL']);

export function canLoadSensitiveReportSummaries(role: string | undefined): boolean {
  return role !== undefined && SENSITIVE_REPORT_ROLES.has(role);
}
