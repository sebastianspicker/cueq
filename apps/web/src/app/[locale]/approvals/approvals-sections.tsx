'use client';

import type { useTranslations } from 'next-intl';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';

export type WorkflowAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'DELEGATE' | 'CANCEL';

export interface WorkflowInboxItem {
  id: string;
  type: string;
  status: string;
  requesterId: string;
  approverId: string | null;
  reason: string | null;
  decisionReason?: string | null;
  dueAt?: string | null;
  escalationLevel?: number;
  isOverdue: boolean;
  availableActions: WorkflowAction[];
}

export const STATUS_FILTERS = [
  'ALL',
  'DRAFT',
  'SUBMITTED',
  'PENDING',
  'ESCALATED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const;

export const TYPE_FILTERS = [
  'ALL',
  'LEAVE_REQUEST',
  'BOOKING_CORRECTION',
  'POST_CLOSE_CORRECTION',
  'SHIFT_SWAP',
  'OVERTIME_APPROVAL',
] as const;

type TranslationFn = ReturnType<typeof useTranslations>;
const EMPTY_VALUE = '—';

function displayOptional(value: string | number | null | undefined): string | number {
  return value ?? EMPTY_VALUE;
}

function AvailableActions({ actions }: { actions: WorkflowAction[] }) {
  if (actions.length === 0) {
    return EMPTY_VALUE;
  }
  return actions.map((available) => (
    <StatusBadge key={available} status={available} variant="muted" />
  ));
}

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
    <SectionCard>
      <h2>{t('filtersTitle')}</h2>
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
                {value}
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
                {value}
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
    </SectionCard>
  );
}

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
                  <StatusBadge status={item.type} variant="info" label={item.type} />
                  <StatusBadge status={item.status} />
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

export function WorkflowDetailSection({
  t,
  loading,
  detail,
  action,
  delegateToId,
  reason,
  onActionChange,
  onDelegateToIdChange,
  onReasonChange,
  onApplyAction,
}: {
  t: TranslationFn;
  loading: boolean;
  detail: WorkflowInboxItem | null;
  action: WorkflowAction;
  delegateToId: string;
  reason: string;
  onActionChange: (value: WorkflowAction) => void;
  onDelegateToIdChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onApplyAction: () => void;
}) {
  if (!detail) {
    return (
      <SectionCard>
        <h2>{t('details')}</h2>
        <p>{t('selectWorkflow')}</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard>
      <h2>{t('details')}</h2>
      <div className="cq-list-stack">
        <WorkflowFacts t={t} detail={detail} />
        <hr className="cq-separator" />
        <WorkflowActionForm
          t={t}
          loading={loading}
          detail={detail}
          action={action}
          delegateToId={delegateToId}
          reason={reason}
          onActionChange={onActionChange}
          onDelegateToIdChange={onDelegateToIdChange}
          onReasonChange={onReasonChange}
          onApplyAction={onApplyAction}
        />
      </div>
    </SectionCard>
  );
}

function WorkflowFacts({ t, detail }: { t: TranslationFn; detail: WorkflowInboxItem }) {
  return (
    <dl className="cq-kv-grid">
      <dt>{t('workflowId')}</dt>
      <dd className="cq-mono">{detail.id}</dd>
      <dt>{t('statusLabel')}</dt>
      <dd>
        <StatusBadge status={detail.status} />
      </dd>
      <dt>{t('requesterId')}</dt>
      <dd>{detail.requesterId}</dd>
      <dt>{t('approverId')}</dt>
      <dd>{displayOptional(detail.approverId)}</dd>
      <dt>{t('dueAt')}</dt>
      <dd>{displayOptional(detail.dueAt)}</dd>
      <dt>{t('escalationLevel')}</dt>
      <dd>{displayOptional(detail.escalationLevel)}</dd>
      <dt>{t('reasonLabel')}</dt>
      <dd>{displayOptional(detail.reason)}</dd>
      <dt>{t('decisionReasonLabel')}</dt>
      <dd>{displayOptional(detail.decisionReason)}</dd>
      <dt>{t('availableActions')}</dt>
      <dd>
        <AvailableActions actions={detail.availableActions} />
      </dd>
    </dl>
  );
}

function WorkflowActionForm({
  t,
  loading,
  detail,
  action,
  delegateToId,
  reason,
  onActionChange,
  onDelegateToIdChange,
  onReasonChange,
  onApplyAction,
}: {
  t: TranslationFn;
  loading: boolean;
  detail: WorkflowInboxItem;
  action: WorkflowAction;
  delegateToId: string;
  reason: string;
  onActionChange: (value: WorkflowAction) => void;
  onDelegateToIdChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onApplyAction: () => void;
}) {
  const hasActions = detail.availableActions.length > 0;
  return (
    <>
      <div className="cq-grid-2">
        <label className="cq-form-field">
          <span>{t('actionLabel')}</span>
          <select
            value={action}
            disabled={!hasActions}
            onChange={(event) => onActionChange(event.target.value as WorkflowAction)}
          >
            {hasActions ? (
              detail.availableActions.map((available) => (
                <option key={available} value={available}>
                  {available}
                </option>
              ))
            ) : (
              <option>{t('noAvailableAction')}</option>
            )}
          </select>
        </label>
        <label className="cq-form-field">
          <span>{t('delegateToId')}</span>
          <input
            value={delegateToId}
            onChange={(event) => onDelegateToIdChange(event.target.value)}
            disabled={action !== 'DELEGATE'}
          />
        </label>
      </div>
      <label className="cq-form-field">
        <span>{t('reasonInput')}</span>
        <input value={reason} onChange={(event) => onReasonChange(event.target.value)} />
      </label>
      <button type="button" disabled={loading || !hasActions} onClick={onApplyAction}>
        {loading ? t('loading') : t('applyAction')}
      </button>
      {!hasActions ? <p className="cq-form-hint">{t('noAvailableAction')}</p> : null}
    </>
  );
}
