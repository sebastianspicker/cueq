'use client';

import type { useTranslations } from 'next-intl';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';
import type { WorkflowAction, WorkflowInboxItem } from './approvals-types';
import { actionLabel, displayOptional, statusLabel } from './approvals-utils';

type TranslationFn = ReturnType<typeof useTranslations>;
const EMPTY_VALUE = '-';

/** Renders the selected workflow and its API-provided available actions. */
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
    <dl className="cq-kv-grid cq-workflow-facts">
      <dt>{t('workflowId')}</dt>
      <dd className="cq-mono">{detail.id}</dd>
      <dt>{t('statusLabel')}</dt>
      <dd>
        <StatusBadge status={detail.status} label={statusLabel(t, detail.status)} />
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
        <AvailableActions t={t} actions={detail.availableActions} />
      </dd>
    </dl>
  );
}

function AvailableActions({ t, actions }: { t: TranslationFn; actions: WorkflowAction[] }) {
  if (actions.length === 0) {
    return EMPTY_VALUE;
  }
  return actions.map((available) => (
    <StatusBadge
      key={available}
      status={available}
      variant="muted"
      label={actionLabel(t, available)}
    />
  ));
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
                  {actionLabel(t, available)}
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
        {loading ? t('loading') : actionLabel(t, action)}
      </button>
      {!hasActions ? <p className="cq-form-hint">{t('noAvailableAction')}</p> : null}
    </>
  );
}
