'use client';

import { useEffect, useMemo } from 'react';
import type { ApiRequest } from '../../platform/http/api-client';
import { WorkspaceReadRequests } from './read-requests';

export function useReadRequests(apiRequest: ApiRequest) {
  const requests = useMemo(() => new WorkspaceReadRequests(apiRequest), [apiRequest]);
  useEffect(() => {
    requests.resume();
    return () => requests.dispose();
  }, [requests]);
  return requests;
}
