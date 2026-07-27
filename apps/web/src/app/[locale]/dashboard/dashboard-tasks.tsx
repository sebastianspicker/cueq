import Link from 'next/link';
import { FormField } from '../../../components/FormField';
import {
  isoInstantToLocalDateTimeInput,
  localDateTimeInputToIsoInstant,
} from '../../../lib/datetime-local';
import type { DashboardSummary, TranslationFn } from './types';

export function OrientationSection({
  t,
  summary,
}: {
  t: TranslationFn;
  summary: DashboardSummary;
}) {
  if (!summary.showOrientation) {
    return null;
  }
  return (
    <aside className="cq-dashboard-orientation">
      <h2>{t('orientationTitle')}</h2>
      <p>{t('orientationBody')}</p>
    </aside>
  );
}

export function DashboardTasks({
  t,
  locale,
  loading,
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
  locale: string;
  loading: boolean;
  summary: DashboardSummary;
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
    <div className="cq-task-strip">
      <section className="cq-task-card" aria-labelledby="cq-leave-title">
        <h3 id="cq-leave-title">{t('leaveCardTitle')}</h3>
        <p>{t('leaveCardBody')}</p>
        <div className="cq-task-card-row">
          <span className="cq-task-hint">{t('privacyNote')}</span>
          <Link className="cq-btn-secondary" href={`/${locale}/leave`}>
            {t('requestLeave')}
          </Link>
        </div>
      </section>

      <section className="cq-task-card" aria-labelledby="cq-overtime-title">
        <h3 id="cq-overtime-title">{t('overtimeTitle')}</h3>
        <p>{t('overtimeReasonDefault')}</p>
        <details className="cq-overtime-details">
          <summary>{t('requestOvertime')}</summary>
          <div className="cq-overtime-fields">
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
            <fieldset className="cq-overtime-period">
              <legend>{t('overtimePeriodStart')}</legend>
              <input
                aria-label={t('overtimePeriodStart')}
                type="datetime-local"
                value={isoInstantToLocalDateTimeInput(overtimePeriodStart)}
                onChange={(event) =>
                  onOvertimePeriodStartChange(
                    localDateTimeInputToIsoInstant(event.target.value) ?? '',
                  )
                }
                required
              />
              <input
                aria-label={t('overtimePeriodEnd')}
                type="datetime-local"
                value={isoInstantToLocalDateTimeInput(overtimePeriodEnd)}
                onChange={(event) =>
                  onOvertimePeriodEndChange(
                    localDateTimeInputToIsoInstant(event.target.value) ?? '',
                  )
                }
                required
              />
            </fieldset>
            <FormField label={t('overtimeReason')} required>
              <textarea
                value={overtimeReason}
                onChange={(event) => onOvertimeReasonChange(event.target.value)}
                required
              />
            </FormField>
            <button type="button" disabled={loading} onClick={onRequestOvertimeApproval}>
              {t('requestOvertime')}
            </button>
          </div>
        </details>
      </section>
    </div>
  );
}
