'use client';

import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';
import {
  formatInstant,
  formatMonth,
  type ClosingPeriod,
  type TranslationFn,
} from './closing-types';

export function ExportsSection({
  t,
  locale,
  loading,
  period,
  onDownloadArtifact,
}: {
  t: TranslationFn;
  locale: string;
  loading: boolean;
  period: ClosingPeriod | null;
  onDownloadArtifact: (runId: string) => void;
}) {
  if (!period) return null;
  const latestRun = period.exportRuns[0];
  return (
    <SectionCard className="cq-closing-evidence-card cq-closing-export">
      <h2>{t('exportsTitle')}</h2>
      {!latestRun ? (
        <>
          <strong>
            {t('noExportForPeriod', { month: formatMonth(period.periodStart, locale) })}
          </strong>
          <dl>
            <dt>{t('checksum')}</dt>
            <dd>-</dd>
          </dl>
        </>
      ) : (
        <>
          <div className="cq-closing-export-heading">
            <strong>{latestRun.format}</strong>
            <StatusBadge status="COMPLETED" label={t('completed')} />
          </div>
          <p>
            {formatInstant(latestRun.exportedAt, locale)} ·{' '}
            {t('recordCount', { count: latestRun.recordCount })}
          </p>
          <dl>
            <dt>{t('checksum')}</dt>
            <dd className="cq-mono">{latestRun.checksum}</dd>
          </dl>
          <button
            type="button"
            className="cq-btn-secondary cq-btn-sm"
            disabled={loading}
            onClick={() => onDownloadArtifact(latestRun.id)}
          >
            {t('downloadArtifact')}
          </button>
        </>
      )}
      <div className="cq-closing-export-note">
        <strong>{t('auditNote')}</strong>
        <p>{t('exportAuditNote')}</p>
      </div>
    </SectionCard>
  );
}
