'use client';

import type { useTranslations } from 'next-intl';
import { LoadingSpinner } from '../../../components/LoadingSpinner';
import { StatusBadge } from '../../../components/StatusBadge';
import type { WorkflowInboxItem } from './approvals-types';
import { statusLabel, typeLabel } from './approvals-utils';

type TranslationFn = ReturnType<typeof useTranslations>;

export function InboxSection({
  t,
  items,
  loading,
  selectedId,
  onLoadDetail,
}: {
  t: TranslationFn;
  items: WorkflowInboxItem[];
  loading: boolean;
  selectedId: string | null;
  onLoadDetail: (workflowId: string) => void;
}) {
  return (
    <section
      className="cq-approval-inbox cq-ledger-section"
      aria-labelledby="cq-approval-inbox-title"
    >
      <div className="cq-ledger-section-head">
        <h2 id="cq-approval-inbox-title">{t('inboxTitle')}</h2>
      </div>
      {loading && items.length === 0 ? (
        <LoadingSpinner label={t('loading')} />
      ) : items.length === 0 ? (
        <p className="cq-ledger-empty">{t('noItems')}</p>
      ) : (
        <ul className="cq-approval-list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="cq-approval-row"
                data-selected={item.id === selectedId || undefined}
                aria-pressed={item.id === selectedId}
                disabled={loading}
                onClick={() => onLoadDetail(item.id)}
              >
                <span className="cq-approval-row-title">{typeLabel(t, item.type)}</span>
                <span className="cq-approval-row-meta">
                  <StatusBadge status={item.status} label={statusLabel(t, item.status)} />
                  {item.isOverdue ? <span className="cq-overdue">{t('isOverdue')}</span> : null}
                </span>
                <span className="cq-approval-row-detail">{item.reason ?? item.requesterId}</span>
                {item.assignmentId ? (
                  <span className="cq-approval-row-detail">
                    {t('assignmentId')}: {item.assignmentId}
                  </span>
                ) : null}
                <span className="cq-approval-row-footer">
                  <span className="cq-mono">{item.id}</span>
                  <span>{t('details')}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
