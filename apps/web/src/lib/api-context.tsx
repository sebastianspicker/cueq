'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { createApiRequest, type ApiRequest } from './api-client';

const API_BASE_STORAGE_KEY = 'cq-api-base-url';
const TOKEN_STORAGE_KEY = 'cq-token';
const DEFAULT_API_BASE_URL = '/api';

function readSessionValue(key: string, fallback: string): string {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    return sessionStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeSessionValue(key: string, value: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (value) {
      sessionStorage.setItem(key, value);
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    // sessionStorage unavailable
  }
}

function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_API_BASE_URL;
  }

  return trimmed === '/' ? DEFAULT_API_BASE_URL : trimmed.replace(/\/$/, '');
}

interface ApiContextValue {
  apiBaseUrl: string;
  setApiBaseUrl: (value: string) => void;
  token: string;
  setToken: (value: string) => void;
  connectionKey: string;
  apiRequest: ApiRequest;
}

const ApiContext = createContext<ApiContextValue | null>(null);

interface ApiProviderProps {
  children: React.ReactNode;
}

export function ApiProvider({ children }: ApiProviderProps) {
  const [apiBaseUrl, setApiBaseUrlState] = useState(() =>
    normalizeApiBaseUrl(readSessionValue(API_BASE_STORAGE_KEY, DEFAULT_API_BASE_URL)),
  );
  const [token, setTokenState] = useState(() => readSessionValue(TOKEN_STORAGE_KEY, ''));

  const value = useMemo<ApiContextValue>(() => {
    const setApiBaseUrl = (nextValue: string) => {
      const normalized = normalizeApiBaseUrl(nextValue);
      setApiBaseUrlState(normalized);
      writeSessionValue(API_BASE_STORAGE_KEY, normalized);

      if (normalized !== apiBaseUrl) {
        setTokenState('');
        writeSessionValue(TOKEN_STORAGE_KEY, '');
      }
    };

    const setToken = (nextValue: string) => {
      setTokenState(nextValue);
      writeSessionValue(TOKEN_STORAGE_KEY, nextValue);
    };

    return {
      apiBaseUrl,
      setApiBaseUrl,
      token,
      setToken,
      connectionKey: `${apiBaseUrl}|${token}`,
      apiRequest: createApiRequest(apiBaseUrl, token, 'Request failed.'),
    };
  }, [apiBaseUrl, token]);

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApiContext() {
  const value = useContext(ApiContext);
  if (!value) {
    throw new Error('useApiContext must be used within ApiProvider.');
  }
  return value;
}
