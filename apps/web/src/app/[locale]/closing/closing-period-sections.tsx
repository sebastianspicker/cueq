'use client';

import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';
import {
  closingChecklistTotals,
  compactIdentifier,
  formatMonth,
  type ClosingChecklistResponse,
  type ClosingPeriod,
  type TranslationFn,
} from './closing-types';

/** Renders period and organization scope controls in the page header. */
export function PeriodQuerySection({
  t,
  locale,
  fromMonth,
  toMonth,
  organizationUnitId,
  selectedOrganizationUnitId,
  loading,
  onFromMonthChange,
  onToMonthChange,
  onOrganizationUnitChange,
  onLoadPeriods,
  organizationUnitLocked = false,
}: {
  t: TranslationFn;
  locale: string;
  fromMonth: string;
  toMonth: string;
  organizationUnitId: string;
  selectedOrganizationUnitId?: string | null;
  loading: boolean;
  onFromMonthChange: (value: string) => void;
  onToMonthChange: (value: string) => void;
  onOrganizationUnitChange: (value: string) => void;
  onLoadPeriods: () => void;
  organizationUnitLocked?: boolean;
}) {
  const organizationScope = organizationUnitId || selectedOrganizationUnitId || '';
  return (
    <div className="cq-closing-scope" aria-label={t('periodQueryTitle')}>
      <label className="cq-closing-scope-field">
        <span className="cq-sr-only">{t('fromMonth')}</span>
        <span className="cq-closing-scope-icon" aria-hidden="true">
          ▣
        </span>
        <input
          type="month"
          value={fromMonth}
          aria-label={t('fromMonth')}
          onChange={(event) => onFromMonthChange(event.target.value)}
        />
        <span className="cq-closing-scope-value" aria-hidden="true">
          {formatMonth(fromMonth, locale)}
        </span>
      </label>
      {toMonth !== fromMonth ? (
        <label className="cq-closing-scope-field">
          <span className="cq-sr-only">{t('toMonth')}</span>
          <input
            type="month"
            value={toMonth}
            aria-label={t('toMonth')}
            onChange={(event) => onToMonthChange(event.target.value)}
          />
        </label>
      ) : null}
      <label className="cq-closing-scope-field cq-closing-scope-field-wide">
        <span className="cq-closing-scope-icon" aria-hidden="true">
          ◇
        </span>
        <span>{t('organizationUnitShort')}</span>
        <input
          value={organizationUnitId}
          aria-label={t('organizationUnitId')}
          title={organizationScope || t('organizationUnitAll')}
          placeholder={
            organizationScope ? compactIdentifier(organizationScope) : t('organizationUnitAll')
          }
          disabled={organizationUnitLocked}
          onChange={(event) => onOrganizationUnitChange(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="cq-btn-secondary cq-btn-sm"
        aria-label={t('loadPeriods')}
        disabled={loading}
        onClick={onLoadPeriods}
      >
        {loading ? t('loading') : t('refresh')}
      </button>
    </div>
  );
}

/** Keeps multi-period selection available without adding a permanent card for the common single result. */
export function PeriodListSection({
  t,
  locale,
  periods,
  selectedPeriod,
  loading,
  onSelectPeriod,
}: {
  t: TranslationFn;
  locale: string;
  periods: ClosingPeriod[];
  selectedPeriod: ClosingPeriod | null;
  loading: boolean;
  onSelectPeriod: (periodId: string) => void;
}) {
  if (periods.length === 1) return null;

  return (
    <SectionCard className="cq-closing-periods">
      <h2>{t('periodListTitle')}</h2>
      {periods.length === 0 ? (
        <p className="cq-text-muted">{t('noPeriods')}</p>
      ) : (
        <div className="cq-closing-period-tabs">
          {periods.map((row) => (
            <button
              key={row.id}
              type="button"
              className="cq-btn-secondary"
              data-active={row.id === selectedPeriod?.id || undefined}
              disabled={loading}
              onClick={() => onSelectPeriod(row.id)}
            >
              {formatMonth(row.periodStart, locale)}
              <StatusBadge status={row.status} />
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/** Renders the shared-border readiness strip from selected-period state. */
export function PeriodStateSection({
  t,
  period,
  checklist,
}: {
  t: TranslationFn;
  period: ClosingPeriod | null;
  checklist: ClosingChecklistResponse | null;
}) {
  if (!period) return null;
  const totals = closingChecklistTotals(checklist);

  return (
    <SectionCard className="cq-closing-metrics">
      <div className="cq-closing-metric">
        <span className="cq-closing-metric-icon" aria-hidden="true">
          ✓
        </span>
        <span>
          <small>{t('stateLabel')}</small>
          <strong className="cq-accent-text">{period.status}</strong>
        </span>
      </div>
      <div className="cq-closing-metric">
        <span className="cq-closing-metric-icon" aria-hidden="true">
          ≡
        </span>
        <span>
          <strong>
            {totals.passed} / {totals.total}
          </strong>
          <small>{t('checks')}</small>
        </span>
      </div>
      <div className="cq-closing-metric">
        <span className="cq-closing-metric-icon" aria-hidden="true">
          ◎
        </span>
        <span>
          <small>{t('leadApprovalLabel')}</small>
          <strong className={period.leadApprovedAt ? 'cq-ok' : 'cq-text-muted'}>
            {period.leadApprovedAt ? t('granted') : t('pending')}
          </strong>
        </span>
      </div>
      <div className="cq-closing-metric">
        <span className="cq-closing-metric-icon cq-closing-metric-icon-warn" aria-hidden="true">
          !
        </span>
        <span>
          <strong>{totals.attention}</strong>
          <small>{t('openFindings')}</small>
        </span>
      </div>
    </SectionCard>
  );
}
