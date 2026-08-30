'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { UserProfileSchema } from '@cueq/contracts';
import type { useApiContext } from '../../platform/http/api-context';
import type { MeProfile, SessionPhase, SessionState, WorkspaceMessages } from './types';

export const SessionContext = createContext<SessionState | null>(null);

export function useSessionContext(): SessionState {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSessionContext must be used within AppWorkspace.');
  }
  return value;
}

export function useOptionalSessionContext(): SessionState | null {
  return useContext(SessionContext);
}

function failurePhase(): SessionPhase {
  return typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error';
}

export function sessionLabelFor(phase: SessionPhase, messages: WorkspaceMessages): string {
  const labels: Record<SessionPhase, string> = {
    loading: messages.sessionLoading,
    ready: messages.sessionReady,
    offline: messages.sessionOffline,
    error: messages.sessionError,
  };
  return labels[phase];
}

interface CurrentProfileRequest {
  apiRequest: ReturnType<typeof useApiContext>['apiRequest'];
  signal: AbortSignal;
  isCurrent: () => boolean;
  onReady: (profile: MeProfile) => void;
  onFailure: () => void;
}

async function requestCurrentProfile({
  apiRequest,
  signal,
  isCurrent,
  onReady,
  onFailure,
}: CurrentProfileRequest): Promise<void> {
  try {
    const nextProfile = await apiRequest('/v1/me', UserProfileSchema, { signal });
    if (isCurrent()) {
      onReady(nextProfile);
    }
  } catch (cause) {
    const aborted = cause instanceof DOMException && cause.name === 'AbortError';
    if (isCurrent() && !aborted) {
      onFailure();
    }
  }
}

/** Loads /v1/me for navigation UX; clears prior identity when credentials change. */
export function useCurrentSession(
  apiRequest: ReturnType<typeof useApiContext>['apiRequest'],
  key: string,
) {
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [profileConnectionKey, setProfileConnectionKey] = useState<string | null>(null);
  const [phase, setPhase] = useState<SessionPhase>('loading');
  const [lastSuccessfulAt, setLastSuccessfulAt] = useState<number | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const refresh = useCallback(() => setRefreshNonce((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let requestIsCurrent = true;

    // A profile is only valid for the exact API endpoint and credentials that
    // produced it. Clear it before a replacement request can expose prior
    // privileged navigation or identity details.
    setProfile(null);
    setProfileConnectionKey(null);
    setLastSuccessfulAt(null);
    if (failurePhase() === 'offline') {
      setPhase('offline');
      return () => {
        requestIsCurrent = false;
        controller.abort();
      };
    }

    setPhase('loading');
    void requestCurrentProfile({
      apiRequest,
      signal: controller.signal,
      isCurrent: () => requestIsCurrent,
      onReady: (nextProfile) => {
        setProfile(nextProfile);
        setProfileConnectionKey(key);
        setLastSuccessfulAt(Date.now());
        setPhase('ready');
      },
      onFailure: () => {
        setProfile(null);
        setProfileConnectionKey(null);
        setLastSuccessfulAt(null);
        setPhase(failurePhase());
      },
    });
    return () => {
      requestIsCurrent = false;
      controller.abort();
    };
  }, [apiRequest, key, refreshNonce]);

  useEffect(() => {
    const handleOffline = () => setPhase('offline');
    const handleOnline = () => refresh();
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [refresh]);

  const identityIsCurrent = profileConnectionKey === key;
  return {
    profile: identityIsCurrent ? profile : null,
    phase,
    lastSuccessfulAt: identityIsCurrent ? lastSuccessfulAt : null,
    refresh,
  };
}
