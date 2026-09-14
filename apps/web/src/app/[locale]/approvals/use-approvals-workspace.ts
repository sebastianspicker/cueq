'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  WorkflowInboxItemPageSchema,
  WorkflowInboxItemSchema,
  WorkflowInstanceSchema,
} from '@cueq/contracts';
import { mergePage, pagePath } from '../../../shared/workspace/cursor-pages';
import { useReadRequests } from '../../../shared/workspace/use-read-requests';
import { useApiContext } from '../../../platform/http/api-context';
import {
  loadAndApply,
  refreshAfterMutation,
  type RefreshResult,
} from '../../../shared/workspace/mutation-refresh';
import {
  type STATUS_FILTERS,
  type TYPE_FILTERS,
  type WorkflowAction,
  type WorkflowInboxItem,
} from './approvals-types';

export function useApprovalsWorkspace() {
  const t = useTranslations('pages.approvals');
  const { apiRequest } = useApiContext();
  const reads = useReadRequests(apiRequest);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('ALL');
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]>('ALL');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
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

  async function loadInbox(
    preserveFeedback = false,
    cursor?: string | null,
  ): Promise<RefreshResult> {
    const read = reads.begin('loadInbox', preserveFeedback);
    const apiRequest = read.request;
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
            pagePath(`/v1/workflows/inbox${query ? `?${query}` : ''}`, cursor),
            WorkflowInboxItemPageSchema,
          ),
        (page) => {
          const data = page.items;
          setItems((previous) => (cursor ? mergePage(previous, data) : data));
          setNextCursor(page.nextCursor);
          setLoadedQuery(query);
          if (!cursor && selectedId && !data.some((entry) => entry.id === selectedId)) {
            setSelectedId(null);
            setDetail(null);
          }
        },
        read.isCurrent,
      );
      if (!read.isCurrent()) return result;
      if (!result.ok && !preserveFeedback) {
        setError(result.cause instanceof Error ? result.cause.message : t('requestFailed'));
      }
      return result;
    } finally {
      if (read.isCurrent()) {
        read.finish();
        if (!preserveFeedback) setLoading(reads.pending);
      }
    }
  }

  async function loadDetail(workflowId: string, preserveFeedback = false): Promise<RefreshResult> {
    const read = reads.begin('loadDetail', preserveFeedback);
    const apiRequest = read.request;
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
        read.isCurrent,
      );
      if (!read.isCurrent()) return result;
      if (!result.ok && preserveFeedback) {
        setSelectedId(null);
        setDetail(null);
      } else if (!result.ok) {
        setError(result.cause instanceof Error ? result.cause.message : t('requestFailed'));
      }
      return result;
    } finally {
      if (read.isCurrent()) {
        read.finish();
        if (!preserveFeedback) setLoading(reads.pending);
      }
    }
  }

  async function applyAction(actionOverride?: WorkflowAction) {
    if (!detail) {
      setError(t('selectWorkflow'));
      return;
    }

    const nextAction = actionOverride ?? action;
    if (!detail.availableActions.includes(nextAction)) {
      setError(t('noAvailableAction'));
      return;
    }

    const operation = reads.begin('mutation');
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const refresh = await refreshAfterMutation(
        () =>
          apiRequest(`/v1/workflows/${detail.id}/decision`, WorkflowInstanceSchema, {
            method: 'POST',
            body: JSON.stringify({
              assignmentId: detail.assignmentId ?? undefined,
              action: nextAction,
              reason: reason || undefined,
              delegateToId: nextAction === 'DELEGATE' ? delegateToId : undefined,
            }),
          }),
        async () => {
          const results = await Promise.all([loadInbox(true), loadDetail(detail.id, true)]);
          const failed = results.find((result) => !result.ok);
          return failed ?? { ok: true };
        },
        operation.isFeedbackCurrent,
      );
      if (!operation.isFeedbackCurrent()) return;
      if (refresh.ok) {
        setMessage(t('actionApplied'));
      } else {
        setError(t('savedRefreshFailed'));
      }
    } catch (cause) {
      if (!operation.isFeedbackCurrent()) return;
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      if (operation.isCurrent()) {
        operation.finish();
        setLoading(reads.pending);
      }
    }
  }

  return {
    statusFilter,
    setStatusFilter,
    typeFilter,
    setTypeFilter,
    overdueOnly,
    setOverdueOnly,
    items,
    selectedId,
    detail,
    action,
    setAction,
    delegateToId,
    setDelegateToId,
    reason,
    setReason,
    loading,
    message,
    error,
    loadInbox,
    nextCursor: loadedQuery === inboxQuery() ? nextCursor : null,
    loadMore: () =>
      nextCursor && loadedQuery === inboxQuery() ? loadInbox(false, nextCursor) : Promise.resolve(),
    loadDetail,
    applyAction,
  };
}
