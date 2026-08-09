/** Stateless sections that preserve the audit workspace's existing labels, structure, and actions. */
import type { useTranslations } from 'next-intl';
import type { AuditEntryItem, AuditSummaryReport } from '@cueq/shared';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBanner } from '../../../components/StatusBanner';

type AuditTranslation = ReturnType<typeof useTranslations>;

export function AuditSummaryRequestSection({
  t,
  from,
  to,
  loading,
  onFromChange,
  onToChange,
  onLoad,
}: {
  t: AuditTranslation;
  from: string;
  to: string;
  loading: boolean;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onLoad: () => void;
}) {
  return (
    <SectionCard>
      <div className="cq-grid-2">
        <label className="cq-form-field">
          <span className="cq-form-label">{t('fromLabel')}</span>
          <input type="date" value={from} onChange={(event) => onFromChange(event.target.value)} />
        </label>
        <label className="cq-form-field">
          <span className="cq-form-label">{t('toLabel')}</span>
          <input type="date" value={to} onChange={(event) => onToChange(event.target.value)} />
        </label>
      </div>

      <button type="button" disabled={loading} onClick={onLoad}>
        {loading ? t('loading') : t('loadSummary')}
      </button>
    </SectionCard>
  );
}

export function AuditSummaryResultsSection({
  t,
  summary,
  loading,
  pageSize,
}: {
  t: AuditTranslation;
  summary: AuditSummaryReport | null;
  loading: boolean;
  pageSize: number;
}) {
  if (summary) {
    return (
      <>
        <SectionCard>
          <h2>{t('summaryTitle')}</h2>
          <p>
            {t('entriesLabel')}: {summary.totals.entries}
          </p>
          <p>
            {t('uniqueActorsLabel')}: {summary.totals.uniqueActors}
          </p>
          <p>
            {t('reportAccessesLabel')}: {summary.totals.reportAccesses}
          </p>
          <p>
            {t('exportsTriggeredLabel')}: {summary.totals.exportsTriggered}
          </p>
          <p>
            {t('lockBlocksLabel')}: {summary.totals.lockBlocks}
          </p>
        </SectionCard>

        <SectionCard>
          <h2>{t('byActionLabel')}</h2>
          <ul className="cq-list-stack">
            {summary.byAction.slice(0, pageSize).map((entry) => (
              <li key={entry.action} className="cq-list-item">
                <strong>{entry.action}</strong>
                <span>{entry.count}</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard>
          <h2>{t('byEntityTypeLabel')}</h2>
          <ul className="cq-list-stack">
            {summary.byEntityType.slice(0, pageSize).map((entry) => (
              <li key={entry.entityType} className="cq-list-item">
                <strong>{entry.entityType}</strong>
                <span>{entry.count}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </>
    );
  }

  return !loading ? (
    <SectionCard>
      <p>{t('noSummary')}</p>
    </SectionCard>
  ) : null;
}

export function AuditEntriesSection({
  t,
  loading,
  error,
  filterAction,
  filterEntityType,
  filterActorId,
  filterEntityId,
  entries,
  entriesTotal,
  entriesSkip,
  onFilterActionChange,
  onFilterEntityTypeChange,
  onFilterActorIdChange,
  onFilterEntityIdChange,
  onLoad,
  onLoadMore,
}: {
  t: AuditTranslation;
  loading: boolean;
  error: string | null;
  filterAction: string;
  filterEntityType: string;
  filterActorId: string;
  filterEntityId: string;
  entries: AuditEntryItem[];
  entriesTotal: number | null;
  entriesSkip: number;
  onFilterActionChange: (value: string) => void;
  onFilterEntityTypeChange: (value: string) => void;
  onFilterActorIdChange: (value: string) => void;
  onFilterEntityIdChange: (value: string) => void;
  onLoad: () => void;
  onLoadMore: () => void;
}) {
  return (
    <SectionCard>
      <h2>{t('browseEntriesTitle')}</h2>

      <StatusBanner error={error} />

      <div className="cq-grid-2">
        <label className="cq-form-field">
          <span className="cq-form-label">{t('actionFilterLabel')}</span>
          <input
            type="text"
            value={filterAction}
            onChange={(event) => onFilterActionChange(event.target.value)}
            placeholder="BOOKING_CREATED"
          />
        </label>
        <label className="cq-form-field">
          <span className="cq-form-label">{t('entityTypeFilterLabel')}</span>
          <input
            type="text"
            value={filterEntityType}
            onChange={(event) => onFilterEntityTypeChange(event.target.value)}
            placeholder="Booking"
          />
        </label>
        <label className="cq-form-field">
          <span className="cq-form-label">{t('actorIdFilterLabel')}</span>
          <input
            type="text"
            value={filterActorId}
            onChange={(event) => onFilterActorIdChange(event.target.value)}
          />
        </label>
        <label className="cq-form-field">
          <span className="cq-form-label">{t('entityIdFilterLabel')}</span>
          <input
            type="text"
            value={filterEntityId}
            onChange={(event) => onFilterEntityIdChange(event.target.value)}
          />
        </label>
      </div>

      <button type="button" disabled={loading} onClick={onLoad}>
        {loading ? t('loading') : t('loadEntries')}
      </button>

      {entriesTotal !== null && <p>{t('totalEntries', { count: entriesTotal })}</p>}

      {entries.length > 0 ? (
        <>
          <ul className="cq-list-stack">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="cq-list-item"
                style={{ flexDirection: 'column', alignItems: 'flex-start' }}
              >
                <span>
                  <strong>{entry.action}</strong>: {entry.entityType}{' '}
                  <code>{entry.entityId.slice(0, 8)}…</code>
                </span>
                <span style={{ fontSize: '0.85em', color: 'var(--cq-text-muted, #666)' }}>
                  {t('entryTimestamp')}: {new Date(entry.timestamp).toLocaleString()} &nbsp;|&nbsp;
                  {t('entryActorId')}: <code>{entry.actorId.slice(0, 8)}…</code>
                  {entry.reason ? ` | ${t('entryReason')}: ${entry.reason}` : ''}
                </span>
              </li>
            ))}
          </ul>

          {entriesTotal !== null && entriesSkip < entriesTotal ? (
            <button type="button" disabled={loading} onClick={onLoadMore}>
              {loading ? t('loading') : t('loadMoreEntries')}
            </button>
          ) : null}
        </>
      ) : !loading && entriesTotal === 0 ? (
        <p>{t('noEntries')}</p>
      ) : null}
    </SectionCard>
  );
}
