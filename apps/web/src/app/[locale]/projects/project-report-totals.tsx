'use client';

import type { ProjectReport } from '@cueq/contracts';
import { useTranslations } from 'next-intl';
import { NativeFacts } from '../../../shared/native-hr/native-panels';

export function ProjectReportTotals({ report }: { report: ProjectReport }) {
  const t = useTranslations('pages.nativeHr');
  if (report.suppression.suppressed || !report.totals)
    return <p role="status">{t('reportSuppressed')}</p>;
  return (
    <NativeFacts
      values={{
        budgetHours: report.totals.budgetHours,
        recordedHours: report.totals.recordedHours,
        varianceHours: report.totals.varianceHours,
      }}
    />
  );
}
