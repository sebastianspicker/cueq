'use client';

import { useEffect, useState } from 'react';
import {
  NullableWorkflowPolicySchema,
  PolicyBundleSchema,
  TimeThresholdsResultSchema,
  WorkflowPolicyHistorySchema,
  WorkflowPolicySchema,
  type PolicyBundle,
  type WorkflowPolicyHistory,
} from '@cueq/contracts';
import type { useTranslations } from 'next-intl';
import { useReadRequests } from '../../../shared/workspace/use-read-requests';
import { useApiContext } from '../../../platform/http/api-context';

const WORKFLOW_TYPES = [
  'LEAVE_REQUEST',
  'BOOKING_CORRECTION',
  'SHIFT_SWAP',
  'OVERTIME_APPROVAL',
  'POST_CLOSE_CORRECTION',
] as const;

type TranslationFn = ReturnType<typeof useTranslations>;

export function usePolicyAdminWorkspace(t: TranslationFn) {
  const { apiBaseUrl, token, apiRequest } = useApiContext();
  const reads = useReadRequests(apiRequest);

  const [asOf, setAsOf] = useState('2026-03-15');
  const [bundle, setBundle] = useState<PolicyBundle | null>(null);
  const [wfType, setWfType] = useState<string>(WORKFLOW_TYPES[0]);
  const [wfEscDeadline, setWfEscDeadline] = useState(48);
  const [wfEscRoles, setWfEscRoles] = useState('HR,ADMIN');
  const [wfMaxDepth, setWfMaxDepth] = useState(5);
  const [wfHistory, setWfHistory] = useState<WorkflowPolicyHistory | null>(null);
  const [dailyMax, setDailyMax] = useState(600);
  const [minRest, setMinRest] = useState(660);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBundle(null);
    setWfHistory(null);
    setMessage(null);
    setError(null);
  }, [apiBaseUrl, token]);

  async function withFeedback(fn: (isCurrent: () => boolean) => Promise<void>) {
    const operation = reads.begin('mutation');
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await fn(operation.isFeedbackCurrent);
    } catch (cause) {
      if (operation.isFeedbackCurrent())
        setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      if (operation.isCurrent()) {
        operation.finish();
        setLoading(reads.pending);
      }
    }
  }

  async function loadBundle() {
    const read = reads.begin('loadBundle');
    const apiRequest = read.request;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const query = new URLSearchParams();
      if (asOf) query.set('asOf', asOf);
      const data = await apiRequest(`/v1/policies?${query.toString()}`, PolicyBundleSchema);
      if (!read.isCurrent()) return;
      setBundle(data);
      setMessage(t('bundleLoaded'));
    } catch (cause) {
      if (!read.isCurrent()) return;
      setBundle(null);
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      if (read.isCurrent()) {
        read.finish();
        setLoading(reads.pending);
      }
    }
  }

  async function loadWorkflowPolicy() {
    const read = reads.begin('loadWorkflowPolicy');
    const apiRequest = read.request;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await apiRequest(
        `/v1/workflows/policies/${wfType}`,
        NullableWorkflowPolicySchema,
      );
      if (!read.isCurrent()) return;
      if (!data) {
        setMessage(t('workflowPolicyMissing'));
        return;
      }
      setWfEscDeadline(data.escalationDeadlineHours);
      setWfEscRoles(data.escalationRoles.join(','));
      setWfMaxDepth(data.maxDelegationDepth);
      setMessage(t('workflowPolicyLoaded'));
    } catch (cause) {
      if (!read.isCurrent()) return;
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      if (read.isCurrent()) {
        read.finish();
        setLoading(reads.pending);
      }
    }
  }

  async function saveWorkflowPolicy() {
    await withFeedback(async (isCurrent) => {
      await apiRequest(`/v1/workflows/policies/${wfType}`, WorkflowPolicySchema, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escalationDeadlineHours: wfEscDeadline,
          escalationRoles: wfEscRoles
            .split(',')
            .map((role) => role.trim())
            .filter(Boolean),
          maxDelegationDepth: wfMaxDepth,
        }),
      });
      if (isCurrent()) setMessage(t('workflowPolicySaved'));
    });
  }

  async function loadPolicyHistory() {
    const read = reads.begin('loadPolicyHistory');
    const apiRequest = read.request;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await apiRequest(
        `/v1/workflows/policies/${wfType}/history`,
        WorkflowPolicyHistorySchema,
      );
      if (!read.isCurrent()) return;
      setWfHistory(data);
      setMessage(t('historyLoaded'));
    } catch (cause) {
      if (!read.isCurrent()) return;
      setWfHistory(null);
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      if (read.isCurrent()) {
        read.finish();
        setLoading(reads.pending);
      }
    }
  }

  async function loadTimeThresholds() {
    const read = reads.begin('loadTimeThresholds');
    const apiRequest = read.request;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await apiRequest('/v1/time-thresholds', TimeThresholdsResultSchema);
      if (!read.isCurrent()) return;
      setDailyMax(data.dailyMaxMinutes);
      setMinRest(data.minRestMinutes);
      setMessage(t('timeThresholdsLoaded'));
    } catch (cause) {
      if (!read.isCurrent()) return;
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      if (read.isCurrent()) {
        read.finish();
        setLoading(reads.pending);
      }
    }
  }

  async function saveTimeThresholds() {
    await withFeedback(async (isCurrent) => {
      await apiRequest('/v1/time-thresholds', TimeThresholdsResultSchema, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyMaxMinutes: dailyMax, minRestMinutes: minRest }),
      });
      if (isCurrent()) setMessage(t('timeThresholdsSaved'));
    });
  }

  return {
    asOf,
    bundle,
    wfType,
    wfEscDeadline,
    wfEscRoles,
    wfMaxDepth,
    wfHistory,
    dailyMax,
    minRest,
    loading,
    message,
    error,
    setAsOf,
    setWfType,
    setWfEscDeadline,
    setWfEscRoles,
    setWfMaxDepth,
    setDailyMax,
    setMinRest,
    loadBundle,
    loadWorkflowPolicy,
    saveWorkflowPolicy,
    loadPolicyHistory,
    loadTimeThresholds,
    saveTimeThresholds,
  };
}
