'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useApiContext } from '../../platform/http/api-context';
import { ApiRequestError, type ApiResponseSchema } from '../../platform/http/api-client';
import { useReadRequests } from '../workspace/use-read-requests';
import { mergePage, pagePath } from '../workspace/cursor-pages';

export type NativePhase = 'loading' | 'ready' | 'error' | 'restricted' | 'conflict' | 'unavailable';
export function nativeFailure(cause: unknown): NativePhase {
  if (cause instanceof ApiRequestError) {
    if (cause.status === 401 || cause.status === 403) return 'restricted';
    if (cause.status === 409) return 'conflict';
    if (cause.status === 503) return 'unavailable';
  }
  return 'error';
}
export function useNativeResource<T>(path: string, schema: ApiResponseSchema<T>) {
  const { apiRequest } = useApiContext();
  const reads = useReadRequests(apiRequest);
  const [state, setState] = useState<{ path: string; data: T | null; phase: NativePhase }>({
    path: '',
    data: null,
    phase: 'loading',
  });
  const load = useCallback(
    async (cursor?: string | null, merge?: (old: T, next: T) => T) => {
      const read = reads.begin('native-resource');
      setState((old) => ({ path, data: old.path === path ? old.data : null, phase: 'loading' }));
      try {
        const data = await read.request(pagePath(path, cursor), schema);
        if (read.isCurrent())
          setState((old) => ({
            path,
            data: merge && old.path === path && old.data ? merge(old.data, data) : data,
            phase: 'ready',
          }));
      } catch (cause) {
        if (read.isCurrent()) setState({ path, data: null, phase: nativeFailure(cause) });
      } finally {
        read.finish();
      }
    },
    [path, schema, reads],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return {
    data: state.path === path ? state.data : null,
    phase: state.path === path ? state.phase : ('loading' as const),
    load,
  };
}
export function useNativeCollection<T extends { id: string }>(
  path: string,
  schema: ApiResponseSchema<{ items: T[]; nextCursor: string | null }>,
) {
  const resource = useNativeResource(path, schema);
  return {
    ...resource,
    more: () =>
      resource.data?.nextCursor
        ? resource.load(resource.data.nextCursor, (old, next) => ({
            ...next,
            items: mergePage(old.items, next.items),
          }))
        : Promise.resolve(),
  };
}
export function useNativeMutation() {
  const t = useTranslations('pages.nativeHr');
  const { apiRequest } = useApiContext();
  const reads = useReadRequests(apiRequest);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function send<T>(
    path: string,
    init: RequestInit,
    schema: ApiResponseSchema<T>,
    after?: () => Promise<unknown>,
  ) {
    const operation = reads.begin('native-mutation');
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const result = await operation.request(path, schema, init);
      if (!operation.isCurrent()) return;
      if (
        result &&
        typeof result === 'object' &&
        'status' in result &&
        result.status === 'CONFLICT'
      )
        setError(t('conflict'));
      else setMessage(t('saved'));
      if (after) await after();
    } catch (cause) {
      if (operation.isCurrent()) setError(t(nativeFailure(cause)));
    } finally {
      if (operation.isCurrent()) {
        operation.finish();
        setLoading(false);
      }
    }
  }
  function save<T>(
    path: string,
    body: unknown,
    schema: ApiResponseSchema<T>,
    after?: () => Promise<unknown>,
  ) {
    return send(path, { method: 'POST', body: JSON.stringify(body) }, schema, after);
  }
  return { save, send, loading, message, error };
}
