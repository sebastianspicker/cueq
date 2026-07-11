'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { PageShell } from '../../../components/PageShell';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';
import {
  FiltersSection,
  InboxSection,
  WorkflowDetailSection,
  type STATUS_FILTERS,
  type TYPE_FILTERS,
  type WorkflowAction,
  type WorkflowInboxItem,
} from './approvals-sections';

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

      <FiltersSection
        t={t}
        loading={loading}
        statusFilter={statusFilter}
        typeFilter={typeFilter}
        overdueOnly={overdueOnly}
        onStatusFilterChange={setStatusFilter}
        onTypeFilterChange={setTypeFilter}
        onOverdueOnlyChange={setOverdueOnly}
        onLoadInbox={() => void loadInbox()}
      />

      <StatusBanner message={message} error={error} />

      <div className="cq-workspace-split">
        <InboxSection
          t={t}
          items={items}
          loading={loading}
          onLoadDetail={(workflowId) => void loadDetail(workflowId)}
        />
        <WorkflowDetailSection
          t={t}
          loading={loading}
          detail={detail}
          action={action}
          delegateToId={delegateToId}
          reason={reason}
          onActionChange={setAction}
          onDelegateToIdChange={setDelegateToId}
          onReasonChange={setReason}
          onApplyAction={() => void applyAction()}
        />
      </div>
    </PageShell>
  );
}
