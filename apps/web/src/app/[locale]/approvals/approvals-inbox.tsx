'use client';

import type { useTranslations } from 'next-intl';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';
import type { WorkflowInboxItem } from './approvals-types';
import { statusLabel, typeLabel } from './approvals-utils';

type TranslationFn = ReturnType<typeof useTranslations>;

/** Renders the filtered workflow inbox and selection controls. */
export function InboxSection({
  t,
  items,
  loading,
  onLoadDetail,
}: {
  t: TranslationFn;
  items: WorkflowInboxItem[];
  loading: boolean;
  onLoadDetail: (workflowId: string) => void;
}) {
  return (
    <SectionCard>
      <h2>{t('inboxTitle')}</h2>
      {items.length === 0 ? (
        <p>{t('noItems')}</p>
      ) : (
        <ul className="cq-list-stack">
          {items.map((item) => (
            <li key={item.id} className="cq-list-item">
              <div className="cq-list-item-header">
                <div className="cq-list-item-meta">
                  <StatusBadge status={item.type} variant="info" label={typeLabel(t, item.type)} />
                  <StatusBadge status={item.status} label={statusLabel(t, item.status)} />
                  {item.isOverdue ? <span className="cq-overdue">{t('isOverdue')}</span> : null}
                </div>
                <button
                  type="button"
                  className="cq-btn-secondary cq-btn-sm"
                  disabled={loading}
                  onClick={() => onLoadDetail(item.id)}
                >
                  {t('details')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
