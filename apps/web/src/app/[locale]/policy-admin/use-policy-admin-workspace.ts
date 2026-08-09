'use client';

/** Owns policy administration state, requests, mutations, and local feedback. */

import { useEffect, useState } from 'react';
import {
  NullableWorkflowPolicySchema,
  PolicyBundleSchema,
  TimeThresholdsResultSchema,
  WorkflowPolicyHistorySchema,
  WorkflowPolicySchema,
  type PolicyBundle,
  type WorkflowPolicyHistory,
} from '@cueq/shared';
import type { useTranslations } from 'next-intl';
import { useApiContext } from '../../../lib/api-context';

const WORKFLOW_TYPES = [
  'LEAVE_REQUEST',
  'BOOKING_CORRECTION',
  'SHIFT_SWAP',
  'OVERTIME_APPROVAL',
  'POST_CLOSE_CORRECTION',
] as const;

type TranslationFn = ReturnType<typeof useTranslations>;

/** Provides the state and actions consumed by the policy administration route composition. */
export function usePolicyAdminWorkspace(t: TranslationFn) {
  const { apiBaseUrl, token, apiRequest } = useApiContext();

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

  function withFeedback<T>(fn: () => Promise<T>): Promise<T> {
    setLoading(true);
    setError(null);
    setMessage(null);
    return fn().finally(() => {
      setLoading(false);
    });
  }

  async function loadBundle() {
    await withFeedback(async () => {
      const query = new URLSearchParams();
      if (asOf) query.set('asOf', asOf);
      const data = await apiRequest(`/v1/policies?${query.toString()}`, PolicyBundleSchema);
      setBundle(data);
      setMessage(t('bundleLoaded'));
    }).catch((cause: unknown) => {
      setBundle(null);
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    });
  }

  async function loadWorkflowPolicy() {
    await withFeedback(async () => {
      const data = await apiRequest(
        `/v1/workflows/policies/${wfType}`,
        NullableWorkflowPolicySchema,
      );
      if (!data) {
        setMessage(t('workflowPolicyMissing'));
        return;
      }
      setWfEscDeadline(data.escalationDeadlineHours);
      setWfEscRoles(data.escalationRoles.join(','));
      setWfMaxDepth(data.maxDelegationDepth);
      setMessage(t('workflowPolicyLoaded'));
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    });
  }

  async function saveWorkflowPolicy() {
    await withFeedback(async () => {
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
      setMessage(t('workflowPolicySaved'));
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    });
  }

  async function loadPolicyHistory() {
    await withFeedback(async () => {
      const data = await apiRequest(
        `/v1/workflows/policies/${wfType}/history`,
        WorkflowPolicyHistorySchema,
      );
      setWfHistory(data);
      setMessage(t('historyLoaded'));
    }).catch((cause: unknown) => {
      setWfHistory(null);
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    });
  }

  async function loadTimeThresholds() {
    await withFeedback(async () => {
      const data = await apiRequest('/v1/time-thresholds', TimeThresholdsResultSchema);
      setDailyMax(data.dailyMaxMinutes);
      setMinRest(data.minRestMinutes);
      setMessage(t('timeThresholdsLoaded'));
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    });
  }

  async function saveTimeThresholds() {
    await withFeedback(async () => {
      await apiRequest('/v1/time-thresholds', TimeThresholdsResultSchema, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyMaxMinutes: dailyMax, minRestMinutes: minRest }),
      });
      setMessage(t('timeThresholdsSaved'));
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
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
