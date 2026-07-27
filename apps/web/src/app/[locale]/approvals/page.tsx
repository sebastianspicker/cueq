'use client';

/** Approval workspace for viewing and submitting workflow actions; server authorization is authoritative. */

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { WorkflowInboxItemSchema, WorkflowInstanceSchema } from '@cueq/shared';
import { PageShell } from '../../../components/PageShell';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';
import {
  loadAndApply,
  refreshAfterMutation,
  type RefreshResult,
} from '../../../lib/mutation-refresh';
import {
  FiltersSection,
  InboxSection,
  WorkflowDetailSection,
  type STATUS_FILTERS,
  type TYPE_FILTERS,
  type WorkflowAction,
  type WorkflowInboxItem,
} from './approvals-sections';

/** Hosts workflow inbox filtering, detail loading, and action feedback. */
export default function ApprovalsPage() {
  const t = useTranslations('pages.approvals');
  const params = useParams<{ locale: string }>();
  const locale = typeof params?.locale === 'string' ? params.locale : 'de';
  const { apiRequest } = useApiContext();
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

  async function loadInbox(preserveFeedback = false): Promise<RefreshResult> {
    if (!preserveFeedback) setLoading(true);
    if (!preserveFeedback) {
      setError(null);
      setMessage(null);
    }
    try {
      const query = inboxQuery();
      const result = await loadAndApply(
        () =>
          apiRequest(
            `/v1/workflows/inbox${query ? `?${query}` : ''}`,
            WorkflowInboxItemSchema.array(),
          ),
        (data) => {
          setItems(data);
          if (selectedId && !data.some((entry) => entry.id === selectedId)) {
            setSelectedId(null);
            setDetail(null);
          }
        },
      );
      if (!result.ok && !preserveFeedback) {
        setError(result.cause instanceof Error ? result.cause.message : t('requestFailed'));
      }
      return result;
    } finally {
      if (!preserveFeedback) setLoading(false);
    }
  }

  async function loadDetail(workflowId: string, preserveFeedback = false): Promise<RefreshResult> {
    if (!preserveFeedback) setLoading(true);
    if (!preserveFeedback) {
      setError(null);
      setMessage(null);
    }
    try {
      const result = await loadAndApply(
        () => apiRequest(`/v1/workflows/${workflowId}`, WorkflowInboxItemSchema),
        (data) => {
          setSelectedId(workflowId);
          setDetail(data);
          if (data.availableActions.length > 0) {
            setAction(data.availableActions[0] as WorkflowAction);
          }
        },
      );
      if (!result.ok && preserveFeedback) {
        setSelectedId(null);
        setDetail(null);
      } else if (!result.ok) {
        setError(result.cause instanceof Error ? result.cause.message : t('requestFailed'));
      }
      return result;
    } finally {
      if (!preserveFeedback) setLoading(false);
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
      const refresh = await refreshAfterMutation(
        () =>
          apiRequest(`/v1/workflows/${detail.id}/decision`, WorkflowInstanceSchema, {
            method: 'POST',
            body: JSON.stringify({
              action,
              reason: reason || undefined,
              delegateToId: action === 'DELEGATE' ? delegateToId : undefined,
            }),
          }),
        async () => {
          const results = await Promise.all([loadInbox(true), loadDetail(detail.id, true)]);
          const failed = results.find((result) => !result.ok);
          return failed ?? { ok: true };
        },
      );
      if (refresh.ok) {
        setMessage(t('actionApplied'));
      } else {
        setError(t('savedRefreshFailed'));
      }
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
