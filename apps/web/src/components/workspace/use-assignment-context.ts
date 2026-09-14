'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AssignmentOptionPageSchema } from '@cueq/contracts';
import type { ApiRequest } from '../../platform/http/api-client';
import { useReadRequests } from '../../shared/workspace/use-read-requests';
import { mergePage, pagePath } from '../../shared/workspace/cursor-pages';
import { chooseAssignment, type AssignmentOption } from './assignment-selection';

interface SelectionState {
  identity: string;
  items: AssignmentOption[];
  selectedId: string | null;
  nextCursor: string | null;
  phase: 'loading' | 'ready' | 'error';
}

export function useAssignmentContext(apiRequest: ApiRequest, identity: string, enabled: boolean) {
  // Component memory belongs to this tab and is never synchronized through localStorage.
  const [state, setState] = useState<SelectionState>({
    identity: '',
    items: [],
    selectedId: null,
    nextCursor: null,
    phase: 'loading',
  });
  const request = useMemo<ApiRequest>(
    () =>
      (...args) =>
        apiRequest(...args),
    [apiRequest, identity],
  );
  const reads = useReadRequests(request);
  const load = useCallback(
    async (cursor?: string | null) => {
      if (!enabled) return;
      const read = reads.begin('assignment-options');
      setState((previous) => ({
        ...(previous.identity === identity
          ? previous
          : { identity, items: [], selectedId: null, nextCursor: null }),
        phase: 'loading',
      }));
      try {
        const page = await read.request(
          pagePath('/v1/session/assignments', cursor),
          AssignmentOptionPageSchema,
        );
        if (!read.isCurrent()) return;
        setState((previous) => {
          const items =
            cursor && previous.identity === identity
              ? mergePage(previous.items, page.items)
              : page.items;
          const selectedId = chooseAssignment(
            items,
            previous.identity === identity ? previous.selectedId : null,
            page.nextCursor,
          );
          return { identity, items, selectedId, nextCursor: page.nextCursor, phase: 'ready' };
        });
      } catch {
        if (read.isCurrent()) setState((previous) => ({ ...previous, phase: 'error' }));
      } finally {
        read.finish();
      }
    },
    [enabled, identity, reads],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const current = enabled && state.identity === identity;
  return {
    items: current ? state.items : [],
    selectedId: current ? state.selectedId : null,
    nextCursor: current ? state.nextCursor : null,
    phase: current ? state.phase : ('loading' as const),
    select: (selectedId: string) =>
      setState((previous) =>
        previous.identity === identity && previous.items.some((item) => item.id === selectedId)
          ? { ...previous, selectedId }
          : previous,
      ),
    retry: () => {
      void load(state.identity === identity ? state.nextCursor : null);
    },
    loadMore: () => {
      if (current && state.nextCursor) void load(state.nextCursor);
    },
  };
}

export type AssignmentContextState = ReturnType<typeof useAssignmentContext>;
