'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

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
  const [apiBaseUrl, setApiBaseUrl] = useState('http://localhost:3001');
  const [token, setToken] = useState('');
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

  const baseUrl = useMemo(() => apiBaseUrl.replace(/\/$/, ''), [apiBaseUrl]);

  async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    const text = await response.text();
    const data = text ? (JSON.parse(text) as T) : (null as T);

    if (!response.ok) {
      throw new Error(text || t('requestFailed'));
    }

    return data;
  }

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
    <section style={{ display: 'grid', gap: '1rem' }}>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>

      <label style={{ display: 'grid', gap: '.25rem' }}>
        <span>{t('apiBaseLabel')}</span>
        <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} />
      </label>

      <label style={{ display: 'grid', gap: '.25rem' }}>
        <span>{t('tokenLabel')}</span>
        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="mock.eyJzdWIiOiJjLi4uIn0"
        />
      </label>

      <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
        <h2>{t('filtersTitle')}</h2>
        <div style={{ display: 'grid', gap: '.5rem', gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <label style={{ display: 'grid', gap: '.25rem' }}>
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

          <label style={{ display: 'grid', gap: '.25rem' }}>
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

          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>{t('overdueOnly')}</span>
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(event) => setOverdueOnly(event.target.checked)}
            />
          </label>
        </div>
        <div style={{ marginTop: '.75rem' }}>
          <button type="button" disabled={loading} onClick={() => void loadInbox()}>
            {loading ? t('loading') : t('loadInbox')}
          </button>
        </div>
      </article>

      {message ? <p style={{ color: '#0f766e' }}>{message}</p> : null}
      {error ? (
        <p role="alert" style={{ color: '#b91c1c' }}>
          {error}
        </p>
      ) : null}

      <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
        <h2>{t('inboxTitle')}</h2>
        {items.length === 0 ? (
          <p>{t('noItems')}</p>
        ) : (
          <ul style={{ display: 'grid', gap: '.5rem' }}>
            {items.map((item) => (
              <li
                key={item.id}
                style={{ border: '1px solid #e5e7eb', borderRadius: '.5rem', padding: '.5rem' }}
              >
                <div>
                  <strong>{item.type}</strong> | {item.status} | {item.id}
                </div>
                <div>
                  {t('isOverdue')}: {item.isOverdue ? t('yes') : t('no')}
                </div>
                <button type="button" disabled={loading} onClick={() => void loadDetail(item.id)}>
                  {t('details')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
        <h2>{t('details')}</h2>
        {!detail ? (
          <p>{t('selectWorkflow')}</p>
        ) : (
          <div style={{ display: 'grid', gap: '.5rem' }}>
            <p>
              {t('workflowId')}: {detail.id}
            </p>
            <p>
              {t('statusLabel')}: {detail.status}
            </p>
            <p>
              {t('requesterId')}: {detail.requesterId}
            </p>
            <p>
              {t('approverId')}: {detail.approverId ?? '—'}
            </p>
            <p>
              {t('dueAt')}: {detail.dueAt ?? '—'}
            </p>
            <p>
              {t('escalationLevel')}: {detail.escalationLevel ?? 0}
            </p>
            <p>
              {t('reasonLabel')}: {detail.reason ?? '—'}
            </p>
            <p>
              {t('decisionReasonLabel')}: {detail.decisionReason ?? '—'}
            </p>
            <p>
              {t('availableActions')}:{' '}
              {detail.availableActions.length > 0 ? detail.availableActions.join(', ') : '—'}
            </p>

            <div style={{ display: 'grid', gap: '.5rem', gridTemplateColumns: 'repeat(2, 1fr)' }}>
              <label style={{ display: 'grid', gap: '.25rem' }}>
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

              <label style={{ display: 'grid', gap: '.25rem' }}>
                <span>{t('delegateToId')}</span>
                <input
                  value={delegateToId}
                  onChange={(event) => setDelegateToId(event.target.value)}
                  disabled={action !== 'DELEGATE'}
                />
              </label>
            </div>

            <label style={{ display: 'grid', gap: '.25rem' }}>
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
      </article>
    </section>
  );
}
