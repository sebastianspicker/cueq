'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AuditEntriesResultSchema,
  AuditSummaryReportSchema,
  type AuditEntryItem,
  type AuditSummaryReport,
} from '@cueq/contracts';
import { mergePage } from '../../../shared/workspace/cursor-pages';
import { useReadRequests } from '../../../shared/workspace/use-read-requests';
import { useApiContext } from '../../../platform/http/api-context';
import {
  getStoredPreference,
  PAGE_SIZE_PREFERENCE_SLOT,
} from '../../../platform/browser/preferences';

export function useAuditWorkspace() {
  const t = useTranslations('pages.audit');
  const { apiBaseUrl, token, apiRequest } = useApiContext();
  const reads = useReadRequests(apiRequest);
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
  const [entriesCursor, setEntriesCursor] = useState<string | null>(null);
  const [entriesLoaded, setEntriesLoaded] = useState(false);
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);

  useEffect(() => {
    setPageSize(Number(getStoredPreference(PAGE_SIZE_PREFERENCE_SLOT, '20')) || 20);
  }, []);

  useEffect(() => {
    setSummary(null);
    setError(null);
    setEntries([]);
    setEntriesCursor(null);
    setEntriesLoaded(false);
  }, [apiBaseUrl, token]);

  async function loadSummary() {
    const read = reads.begin('loadSummary');
    const apiRequest = read.request;
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
      if (!read.isCurrent()) return;
      setSummary(result);
    } catch (cause) {
      if (!read.isCurrent()) return;
      setSummary(null);
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      if (read.isCurrent()) {
        read.finish();
        setLoading(false);
      }
    }
  }

  function entriesQuery() {
    const params = new URLSearchParams();
    if (from) params.set('from', `${from}T00:00:00.000Z`);
    if (to) params.set('to', `${to}T23:59:59.999Z`);
    if (filterAction) params.set('action', filterAction);
    if (filterEntityType) params.set('entityType', filterEntityType);
    if (filterActorId) params.set('actorId', filterActorId);
    if (filterEntityId) params.set('entityId', filterEntityId);
    params.set('limit', String(Math.min(100, Math.max(1, pageSize))));
    return params.toString();
  }

  async function loadEntries(cursor?: string | null) {
    const read = reads.begin('loadEntries');
    const apiRequest = read.request;
    setEntriesLoading(true);
    setEntriesError(null);
    try {
      const query = entriesQuery();
      const params = new URLSearchParams(query);
      if (cursor) params.set('cursor', cursor);

      const result = await apiRequest(
        `/v1/audit-entries?${params.toString()}`,
        AuditEntriesResultSchema,
      );
      if (!read.isCurrent()) return;
      setEntries((previous) => (cursor ? mergePage(previous, result.items) : result.items));
      setEntriesCursor(result.nextCursor);
      setEntriesLoaded(true);
      setLoadedQuery(query);
    } catch (cause) {
      if (!read.isCurrent()) return;
      setEntriesError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      if (read.isCurrent()) {
        read.finish();
        setEntriesLoading(false);
      }
    }
  }

  function loadEntriesFromStart() {
    setEntries([]);
    setEntriesCursor(null);
    return loadEntries();
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
    entriesCursor: loadedQuery === entriesQuery() ? entriesCursor : null,
    entriesLoaded,
    loadSummary,
    loadMore: () =>
      entriesCursor && loadedQuery === entriesQuery()
        ? loadEntries(entriesCursor)
        : Promise.resolve(),
    loadEntriesFromStart,
  };
}
