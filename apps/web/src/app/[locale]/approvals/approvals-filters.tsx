'use client';

import type { useTranslations } from 'next-intl';
import { STATUS_FILTERS, TYPE_FILTERS } from './approvals-types';
import { statusLabel, typeLabel } from './approvals-utils';

type TranslationFn = ReturnType<typeof useTranslations>;

export function FiltersSection({
  t,
  loading,
  statusFilter,
  typeFilter,
  overdueOnly,
  onStatusFilterChange,
  onTypeFilterChange,
  onOverdueOnlyChange,
  onLoadInbox,
}: {
  t: TranslationFn;
  loading: boolean;
  statusFilter: (typeof STATUS_FILTERS)[number];
  typeFilter: (typeof TYPE_FILTERS)[number];
  overdueOnly: boolean;
  onStatusFilterChange: (value: (typeof STATUS_FILTERS)[number]) => void;
  onTypeFilterChange: (value: (typeof TYPE_FILTERS)[number]) => void;
  onOverdueOnlyChange: (value: boolean) => void;
  onLoadInbox: () => void;
}) {
  return (
    <section
      className="cq-approval-filters cq-ledger-section"
      aria-labelledby="cq-approval-filters-title"
    >
      <div className="cq-ledger-section-head">
        <h2 id="cq-approval-filters-title">{t('filtersTitle')}</h2>
      </div>
      <div className="cq-grid-3">
        <label className="cq-form-field">
          <span>{t('statusFilter')}</span>
          <select
            value={statusFilter}
            onChange={(event) =>
              onStatusFilterChange(event.target.value as (typeof STATUS_FILTERS)[number])
            }
          >
            {STATUS_FILTERS.map((value) => (
              <option key={value} value={value}>
                {statusLabel(t, value)}
              </option>
            ))}
          </select>
        </label>

        <label className="cq-form-field">
          <span>{t('typeFilter')}</span>
          <select
            value={typeFilter}
            onChange={(event) =>
              onTypeFilterChange(event.target.value as (typeof TYPE_FILTERS)[number])
            }
          >
            {TYPE_FILTERS.map((value) => (
              <option key={value} value={value}>
                {typeLabel(t, value)}
              </option>
            ))}
          </select>
        </label>

        <label className="cq-checkbox-field">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(event) => onOverdueOnlyChange(event.target.checked)}
          />
          <span>{t('overdueOnly')}</span>
        </label>
      </div>
      <div className="cq-space-top-sm">
        <button type="button" disabled={loading} onClick={onLoadInbox}>
          {loading ? t('loading') : t('loadInbox')}
        </button>
      </div>
    </section>
  );
}
