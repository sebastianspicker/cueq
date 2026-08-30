'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AuditEntriesResultSchema,
  AuditSummaryReportSchema,
  type AuditEntryItem,
  type AuditSummaryReport,
} from '@cueq/contracts';
import { useApiContext } from '../../../platform/http/api-context';
import {
  getStoredPreference,
  PAGE_SIZE_PREFERENCE_SLOT,
} from '../../../platform/browser/preferences';

export function useAuditWorkspace() {
  const t = useTranslations('pages.audit');
  const { apiBaseUrl, token, apiRequest } = useApiContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('2026-03-01');
  const [to, setTo] = useState('2026-03-31');
  const [pageSize, setPageSize] = useState(20);
  const [summary, setSummary] = useState<AuditSummaryReport | null>(null);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState('');
  const [filterEntityType, setFilterEntityType] = useState('');
  const [filterActorId, setFilterActorId] = useState('');
  const [filterEntityId, setFilterEntityId] = useState('');
  const [entries, setEntries] = useState<AuditEntryItem[]>([]);
  const [entriesTotal, setEntriesTotal] = useState<number | null>(null);
  const [entriesSkip, setEntriesSkip] = useState(0);

  useEffect(() => {
    setPageSize(Number(getStoredPreference(PAGE_SIZE_PREFERENCE_SLOT, '20')) || 20);
  }, []);

  useEffect(() => {
    setSummary(null);
    setError(null);
    setEntries([]);
    setEntriesTotal(null);
    setEntriesSkip(0);
  }, [apiBaseUrl, token]);

  async function loadSummary() {
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const params = new URLSearchParams();
      params.set('from', from);
      params.set('to', to);
      const result = await apiRequest(
        `/v1/reports/audit-summary?${params.toString()}`,
        AuditSummaryReportSchema,
      );
      setSummary(result);
    } catch (cause) {
      setSummary(null);
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function loadEntries(skip = 0) {
    setEntriesLoading(true);
    setEntriesError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', `${from}T00:00:00.000Z`);
      if (to) params.set('to', `${to}T23:59:59.999Z`);
      if (filterAction) params.set('action', filterAction);
      if (filterEntityType) params.set('entityType', filterEntityType);
      if (filterActorId) params.set('actorId', filterActorId);
      if (filterEntityId) params.set('entityId', filterEntityId);
      params.set('skip', String(skip));
      params.set('take', String(pageSize));

      const result = await apiRequest(
        `/v1/audit-entries?${params.toString()}`,
        AuditEntriesResultSchema,
      );
      setEntries(skip === 0 ? result.items : (previous) => [...previous, ...result.items]);
      setEntriesTotal(result.total);
      setEntriesSkip(skip + result.items.length);
    } catch (cause) {
      setEntriesError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setEntriesLoading(false);
    }
  }

  function loadEntriesFromStart() {
    setEntries([]);
    setEntriesSkip(0);
    return loadEntries(0);
  }

  return {
    loading,
    error,
    from,
    setFrom,
    to,
    setTo,
    pageSize,
    summary,
    entriesLoading,
    entriesError,
    filterAction,
    setFilterAction,
    filterEntityType,
    setFilterEntityType,
    filterActorId,
    setFilterActorId,
    filterEntityId,
    setFilterEntityId,
    entries,
    entriesTotal,
    entriesSkip,
    loadSummary,
    loadEntries,
    loadEntriesFromStart,
  };
}
