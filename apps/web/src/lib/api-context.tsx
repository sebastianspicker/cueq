'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { createApiRequest, type ApiRequest } from './api-client';

interface ApiContextValue {
  apiBaseUrl: string;
  setApiBaseUrl: (value: string) => void;
  token: string;
  setToken: (value: string) => void;
  apiRequest: ApiRequest;
}

const ApiContext = createContext<ApiContextValue | null>(null);

interface ApiProviderProps {
  children: React.ReactNode;
}

export function ApiProvider({ children }: ApiProviderProps) {
  const [apiBaseUrl, setApiBaseUrl] = useState('http://localhost:3001');
  const [token, setToken] = useState('');

  const value = useMemo<ApiContextValue>(() => {
    return {
      apiBaseUrl,
      setApiBaseUrl,
      token,
      setToken,
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
