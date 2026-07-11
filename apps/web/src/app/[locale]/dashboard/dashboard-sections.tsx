'use client';

import Link from 'next/link';
import type { useTranslations } from 'next-intl';
import { FormField } from '../../../components/FormField';
import { SectionCard } from '../../../components/SectionCard';

export interface DashboardSummary {
  personId: string;
  modelName: string;
  todayTargetHours: number;
  currentBalanceHours: number;
  todayBookingsCount: number;
  hasFirstBooking: boolean;
  showOrientation: boolean;
  clockInTimeTypeId: string | null;
  quickActions: string[];
}

type TranslationFn = ReturnType<typeof useTranslations>;

export function DashboardSummarySection({
  t,
  summary,
  formatHours,
}: {
  t: TranslationFn;
  summary: DashboardSummary | null;
  formatHours: (value: number) => string;
}) {
  if (!summary) {
    return null;
  }

  return (
    <SectionCard>
      <h2>{t('summaryTitle')}</h2>
      <p>
        {t('modelName')}: {summary.modelName}
      </p>
      <div className="cq-stat-row">
        <div className="cq-stat-card">
          <span className="cq-stat-label">{t('todayTargetHours')}</span>
          <span className="cq-stat-value">{formatHours(summary.todayTargetHours)}</span>
        </div>
        <div className="cq-stat-card">
          <span className="cq-stat-label">{t('currentBalanceHours')}</span>
          <span className="cq-stat-value">{formatHours(summary.currentBalanceHours)}</span>
        </div>
        <div className="cq-stat-card">
          <span className="cq-stat-label">{t('todayBookingsCount')}</span>
          <span className="cq-stat-value">{summary.todayBookingsCount}</span>
        </div>
      </div>
    </SectionCard>
  );
}

export function OrientationSection({
  t,
  summary,
}: {
  t: TranslationFn;
  summary: DashboardSummary | null;
}) {
  if (!summary?.showOrientation) {
    return null;
  }

  return (
    <SectionCard>
      <h2>{t('orientationTitle')}</h2>
      <p>{t('orientationBody')}</p>
    </SectionCard>
  );
}

export function QuickActionsSection({
  t,
  locale,
  loading,
  summary,
  onClockIn,
}: {
  t: TranslationFn;
  locale: string;
  loading: boolean;
  summary: DashboardSummary | null;
  onClockIn: () => void;
}) {
  return (
    <SectionCard>
      <h2>{t('quickActionsTitle')}</h2>
      <div className="cq-inline-actions">
        <button type="button" disabled={loading || !summary} onClick={onClockIn}>
          {t('clockIn')}
        </button>
        <Link href={`/${locale}/leave`}>{t('requestLeave')}</Link>
      </div>
    </SectionCard>
  );
}

export function OvertimeSection({
  t,
  loading,
  summary,
  overtimeHours,
  overtimeReason,
  overtimePeriodStart,
  overtimePeriodEnd,
  onOvertimeHoursChange,
  onOvertimeReasonChange,
  onOvertimePeriodStartChange,
  onOvertimePeriodEndChange,
  onRequestOvertimeApproval,
}: {
  t: TranslationFn;
  loading: boolean;
  summary: DashboardSummary | null;
  overtimeHours: string;
  overtimeReason: string;
  overtimePeriodStart: string;
  overtimePeriodEnd: string;
  onOvertimeHoursChange: (value: string) => void;
  onOvertimeReasonChange: (value: string) => void;
  onOvertimePeriodStartChange: (value: string) => void;
  onOvertimePeriodEndChange: (value: string) => void;
  onRequestOvertimeApproval: () => void;
}) {
  return (
    <SectionCard>
      <h2>{t('overtimeTitle')}</h2>
      <div className="cq-grid-2">
        <FormField label={t('overtimeHours')} required>
          <input
            type="number"
            min={0.25}
            step={0.25}
            value={overtimeHours}
            onChange={(event) => onOvertimeHoursChange(event.target.value)}
            required
          />
        </FormField>
        <FormField label={t('overtimeReason')} required>
          <input
            value={overtimeReason}
            onChange={(event) => onOvertimeReasonChange(event.target.value)}
            required
          />
        </FormField>
        <FormField label={t('overtimePeriodStart')} required>
          <input
            type="datetime-local"
            value={overtimePeriodStart.slice(0, 16)}
            onChange={(event) =>
              onOvertimePeriodStartChange(new Date(event.target.value).toISOString())
            }
            required
          />
        </FormField>
        <FormField label={t('overtimePeriodEnd')} required>
          <input
            type="datetime-local"
            value={overtimePeriodEnd.slice(0, 16)}
            onChange={(event) =>
              onOvertimePeriodEndChange(new Date(event.target.value).toISOString())
            }
            required
          />
        </FormField>
      </div>
      <div className="cq-space-top-sm">
        <button type="button" disabled={loading || !summary} onClick={onRequestOvertimeApproval}>
          {t('requestOvertime')}
        </button>
      </div>
    </SectionCard>
  );
}
