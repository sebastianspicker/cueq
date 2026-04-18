'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';

type WorkflowAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'DELEGATE' | 'CANCEL';

interface WorkflowInboxItem {
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

const STATUS_FILTERS = [
  'ALL',
  'DRAFT',
  'SUBMITTED',
  'PENDING',
  'ESCALATED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const;
const TYPE_FILTERS = [
  'ALL',
  'LEAVE_REQUEST',
  'BOOKING_CORRECTION',
  'POST_CLOSE_CORRECTION',
  'SHIFT_SWAP',
  'OVERTIME_APPROVAL',
] as const;

export default function ApprovalsPage() {
  const t = useTranslations('pages.approvals');
  const params = useParams<{ locale: string }>();
  const locale = typeof params?.locale === 'string' ? params.locale : 'de';
  const { apiBaseUrl, setApiBaseUrl, token, setToken, apiRequest } = useApiContext();
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('ALL');
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]>('ALL');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [items, setItems] = useState<WorkflowInboxItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkflowInboxItem | null>(null);
  const [action, setAction] = useState<WorkflowAction>('APPROVE');
  const [delegateToId, setDelegateToId] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function inboxQuery() {
    const params = new URLSearchParams();
    if (statusFilter !== 'ALL') {
      params.set('status', statusFilter);
    }
    if (typeFilter !== 'ALL') {
      params.set('type', typeFilter);
    }
    if (overdueOnly) {
      params.set('overdueOnly', 'true');
    }
    return params.toString();
  }

  async function loadInbox(preserveFeedback = false) {
    setLoading(true);
    if (!preserveFeedback) {
      setError(null);
      setMessage(null);
    }
    try {
      const query = inboxQuery();
      const data = await apiRequest<WorkflowInboxItem[]>(
        `/v1/workflows/inbox${query ? `?${query}` : ''}`,
      );
      setItems(data);

      if (selectedId) {
        const stillExists = data.some((entry) => entry.id === selectedId);
        if (!stillExists) {
          setSelectedId(null);
          setDetail(null);
        }
      }
    } catch (cause) {
      if (!preserveFeedback) {
        setError(cause instanceof Error ? cause.message : t('requestFailed'));
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(workflowId: string, preserveFeedback = false) {
    setLoading(true);
    if (!preserveFeedback) {
      setError(null);
      setMessage(null);
    }
    try {
      const data = await apiRequest<WorkflowInboxItem>(`/v1/workflows/${workflowId}`);
      setSelectedId(workflowId);
      setDetail(data);
      if (data.availableActions.length > 0) {
        setAction(data.availableActions[0] as WorkflowAction);
      }
    } catch (cause) {
      if (preserveFeedback) {
        setSelectedId(null);
        setDetail(null);
      } else {
        setError(cause instanceof Error ? cause.message : t('requestFailed'));
      }
    } finally {
      setLoading(false);
    }
  }

  async function applyAction() {
    if (!detail) {
      setError(t('selectWorkflow'));
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/v1/workflows/${detail.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          reason: reason || undefined,
          delegateToId: action === 'DELEGATE' ? delegateToId : undefined,
        }),
      });
      setMessage(t('actionApplied'));
      await Promise.all([loadInbox(true), loadDetail(detail.id, true)]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell
      title={t('title')}
      description={t('description')}
      breadcrumbs={[{ label: 'cueq', href: `/${locale}` }, { label: t('title') }]}
    >
      <ConnectionPanel
        apiBaseLabel={t('apiBaseLabel')}
        tokenLabel={t('tokenLabel')}
        apiBaseUrl={apiBaseUrl}
        setApiBaseUrl={setApiBaseUrl}
        token={token}
        setToken={setToken}
      />

      <SectionCard>
        <h2>{t('filtersTitle')}</h2>
        <div className="cq-grid-3">
          <label className="cq-form-field">
            <span>{t('statusFilter')}</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as (typeof STATUS_FILTERS)[number])
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
                setTypeFilter(event.target.value as (typeof TYPE_FILTERS)[number])
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
              onChange={(event) => setOverdueOnly(event.target.checked)}
            />
            <span>{t('overdueOnly')}</span>
          </label>
        </div>
        <div className="cq-space-top-sm">
          <button type="button" disabled={loading} onClick={() => void loadInbox()}>
            {loading ? t('loading') : t('loadInbox')}
          </button>
        </div>
      </SectionCard>

      <StatusBanner message={message} error={error} />

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
                    onClick={() => void loadDetail(item.id)}
                  >
                    {t('details')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard>
        <h2>{t('details')}</h2>
        {!detail ? (
          <p>{t('selectWorkflow')}</p>
        ) : (
          <div className="cq-list-stack">
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
              <dd>{detail.approverId ?? '—'}</dd>
              <dt>{t('dueAt')}</dt>
              <dd>{detail.dueAt ?? '—'}</dd>
              <dt>{t('escalationLevel')}</dt>
              <dd>{detail.escalationLevel ?? 0}</dd>
              <dt>{t('reasonLabel')}</dt>
              <dd>{detail.reason ?? '—'}</dd>
              <dt>{t('decisionReasonLabel')}</dt>
              <dd>{detail.decisionReason ?? '—'}</dd>
              <dt>{t('availableActions')}</dt>
              <dd>
                {detail.availableActions.length > 0
                  ? detail.availableActions.map((a) => (
                      <StatusBadge key={a} status={a} variant="muted" />
                    ))
                  : '—'}
              </dd>
            </dl>

            <hr className="cq-separator" />

            <div className="cq-grid-2">
              <label className="cq-form-field">
                <span>{t('actionLabel')}</span>
                <select
                  value={action}
                  onChange={(event) => setAction(event.target.value as WorkflowAction)}
                >
                  {detail.availableActions.length > 0
                    ? detail.availableActions.map((available) => (
                        <option key={available} value={available}>
                          {available}
                        </option>
                      ))
                    : [<option key="none">NONE</option>]}
                </select>
              </label>

              <label className="cq-form-field">
                <span>{t('delegateToId')}</span>
                <input
                  value={delegateToId}
                  onChange={(event) => setDelegateToId(event.target.value)}
                  disabled={action !== 'DELEGATE'}
                />
              </label>
            </div>

            <label className="cq-form-field">
              <span>{t('reasonInput')}</span>
              <input value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>

            <button
              type="button"
              disabled={loading || detail.availableActions.length === 0}
              onClick={() => void applyAction()}
            >
              {loading ? t('loading') : t('applyAction')}
            </button>
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
