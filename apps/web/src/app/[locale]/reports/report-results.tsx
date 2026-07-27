/** Typed report-result renderers, including suppression metadata for privacy-aware summaries. */
import type { useTranslations } from 'next-intl';
import { SectionCard } from '../../../components/SectionCard';

type TranslationFn = ReturnType<typeof useTranslations>;

interface ReportSuppression {
  suppressed: boolean;
  minGroupSize: number;
  population: number;
}

export interface TeamAbsenceReport {
  organizationUnitId: string;
  from: string;
  to: string;
  suppression: ReportSuppression;
  totals: { requests: number; days: number };
  buckets: Array<{ type: string; requests: number; days: number }>;
}

export interface OeOvertimeReport {
  organizationUnitId: string;
  from: string;
  to: string;
  suppression: ReportSuppression;
  totals: {
    people: number;
    totalBalanceHours: number;
    totalOvertimeHours: number;
    avgBalanceHours: number;
  };
}

export interface ClosingCompletionReport {
  from: string;
  to: string;
  organizationUnitId?: string | null;
  totals: {
    periods: number;
    exported: number;
    closed: number;
    review: number;
    open: number;
    completionRate: number;
  };
}

export interface AuditSummaryReport {
  from: string;
  to: string;
  totals: {
    entries: number;
    uniqueActors: number;
    reportAccesses: number;
    exportsTriggered: number;
    lockBlocks: number;
  };
  byAction: Array<{ action: string; count: number }>;
  byEntityType: Array<{ entityType: string; count: number }>;
}

export interface ComplianceSummaryReport {
  from: string;
  to: string;
  privacy: {
    minGroupSize: number;
    reportAccesses: number;
    suppressedReportAccesses: number;
    suppressionRate: number;
  };
  closing: {
    periods: number;
    exported: number;
    completionRate: number;
    lockBlocks: number;
    postCloseCorrections: number;
  };
  payrollExport: {
    runs: number;
    uniqueChecksums: number;
    duplicateChecksums: number;
    lastRunAt: string | null;
  };
  operations: { lastBackupRestoreVerifiedAt: string | null };
}

interface ReportResultsProps {
  t: TranslationFn;
  loaded: boolean;
  teamAbsence: TeamAbsenceReport | null;
  oeOvertime: OeOvertimeReport | null;
  closingCompletion: ClosingCompletionReport | null;
  auditSummary: AuditSummaryReport | null;
  complianceSummary: ComplianceSummaryReport | null;
}

function TeamAbsenceResult({ t, report }: { t: TranslationFn; report: TeamAbsenceReport }) {
  return (
    <SectionCard>
      <h2>{t('teamAbsenceHeading')}</h2>
      <p>{t('absenceTotals', report.totals)}</p>
      <p>
        {t(report.suppression.suppressed ? 'suppressionActive' : 'suppressionInactive', {
          population: report.suppression.population,
          minGroupSize: report.suppression.minGroupSize,
        })}
      </p>
    </SectionCard>
  );
}

function OvertimeResult({ t, report }: { t: TranslationFn; report: OeOvertimeReport }) {
  return (
    <SectionCard>
      <h2>{t('oeOvertimeHeading')}</h2>
      <p>{t('overtimeTotals', report.totals)}</p>
      <p>
        {t(report.suppression.suppressed ? 'suppressionActive' : 'suppressionInactive', {
          population: report.suppression.population,
          minGroupSize: report.suppression.minGroupSize,
        })}
      </p>
    </SectionCard>
  );
}

function ClosingCompletionResult({
  t,
  report,
}: {
  t: TranslationFn;
  report: ClosingCompletionReport;
}) {
  return (
    <SectionCard>
      <h2>{t('closingCompletionHeading')}</h2>
      <p>{t('closingTotals', report.totals)}</p>
    </SectionCard>
  );
}

function AuditSummaryResult({ t, report }: { t: TranslationFn; report: AuditSummaryReport }) {
  return (
    <SectionCard>
      <h2>{t('auditSummaryHeading')}</h2>
      <p>{t('auditTotals', report.totals)}</p>
      <p>
        {t('byActionLabel')}: {report.byAction.length}
      </p>
      <p>
        {t('byEntityTypeLabel')}: {report.byEntityType.length}
      </p>
    </SectionCard>
  );
}

function ComplianceSummaryResult({
  t,
  report,
}: {
  t: TranslationFn;
  report: ComplianceSummaryReport;
}) {
  return (
    <SectionCard>
      <h2>{t('complianceSummaryHeading')}</h2>
      <p>
        {t('complianceTotals', {
          reportAccesses: report.privacy.reportAccesses,
          periods: report.closing.periods,
        })}
      </p>
      <p>
        {t('lastBackupLabel')}: {report.operations.lastBackupRestoreVerifiedAt ?? '-'}
      </p>
    </SectionCard>
  );
}

/** Renders the selected report result while retaining any API-provided suppression notice. */
export function ReportResults({
  t,
  loaded,
  teamAbsence,
  oeOvertime,
  closingCompletion,
  auditSummary,
  complianceSummary,
}: ReportResultsProps) {
  if (!loaded) {
    return null;
  }

  return (
    <>
      {teamAbsence ? <TeamAbsenceResult t={t} report={teamAbsence} /> : null}
      {oeOvertime ? <OvertimeResult t={t} report={oeOvertime} /> : null}
      {closingCompletion ? <ClosingCompletionResult t={t} report={closingCompletion} /> : null}
      {auditSummary ? <AuditSummaryResult t={t} report={auditSummary} /> : null}
      {complianceSummary ? <ComplianceSummaryResult t={t} report={complianceSummary} /> : null}
    </>
  );
}
