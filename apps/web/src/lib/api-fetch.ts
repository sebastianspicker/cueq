/** Low-level authenticated fetch factory for browser API calls. */

import type { ApiFetch } from './api-client-types';
import {
  assertSafeApiBaseUrl,
  assertSafeApiRequestPath,
  buildApiHeaders,
  normalizeApiBaseUrl,
} from './api-url-policy';

/** Creates the low-level authenticated fetch wrapper used by client API calls. */
export function createApiFetch(baseUrl: string, token: string): ApiFetch {
  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);

  return async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
    assertSafeApiBaseUrl(
      normalizedBaseUrl,
      typeof window === 'undefined' ? undefined : window.location.origin,
    );
    assertSafeApiRequestPath(path);

    return fetch(`${normalizedBaseUrl}${path}`, {
      ...init,
      headers: buildApiHeaders(token, init),
    });
  };
}
