'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApiContext } from './api-context';

interface UseApiQueryResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => void;
}

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const queryCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<unknown>>();

function getCacheKey(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`;
}

/**
 * Lightweight data-fetching hook with request deduplication and TTL cache.
 *
 * Prevents duplicate in-flight requests to the same endpoint and caches
 * results for 30 seconds. Automatically refetches when the path changes.
 */
export function useApiQuery<T>(path: string | null): UseApiQueryResult<T> {
  const { apiRequest, apiBaseUrl } = useApiContext();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchData = useCallback(async () => {
    if (!path) return;

    const key = getCacheKey(apiBaseUrl, path);

    // Check cache
    const cached = queryCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      setData(cached.data as T);
      setError(null);
      return;
    }

    // Deduplicate in-flight requests
    const inflight = inflightRequests.get(key);
    if (inflight) {
      try {
        const result = await inflight;
        if (mountedRef.current) {
          setData(result as T);
          setError(null);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Request failed');
        }
      }
      return;
    }

    setLoading(true);
    setError(null);

    const promise = apiRequest<T>(path);
    inflightRequests.set(key, promise);

    try {
      const result = await promise;
      queryCache.set(key, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
      if (mountedRef.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Request failed');
      }
    } finally {
      inflightRequests.delete(key);
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [path, apiBaseUrl, apiRequest]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const refetch = useCallback(() => {
    if (path) {
      const key = getCacheKey(apiBaseUrl, path);
      queryCache.delete(key);
    }
    void fetchData();
  }, [path, apiBaseUrl, fetchData]);

  return { data, error, loading, refetch };
}
