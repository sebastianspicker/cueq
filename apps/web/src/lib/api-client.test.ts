import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiRequest } from './api-client';

const ORIGINAL_FETCH = globalThis.fetch;

describe('createApiRequest', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (ORIGINAL_FETCH) {
      globalThis.fetch = ORIGINAL_FETCH;
    }
  });

  it('merges default and custom headers when init.headers is a Headers instance', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const apiRequest = createApiRequest('http://localhost:3001', 'mock-token', 'Request failed.');
    const customHeaders = new Headers({ 'X-Correlation-Id': 'req-123' });

    await apiRequest('/v1/dashboard/me', {
      headers: customHeaders,
    });

    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit?]>;
    expect(calls[0]).toBeDefined();
    const options = calls[0]?.[1] ?? {};
    const headers = new Headers(options.headers ?? {});
    expect(headers.get('Authorization')).toBe('Bearer mock-token');
    expect(headers.get('X-Correlation-Id')).toBe('req-123');
  });

  it('does not force content-type for bodyless requests', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const apiRequest = createApiRequest('http://localhost:3001', 'mock-token', 'Request failed.');
    await apiRequest('/v1/dashboard/me');

    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit?]>;
    expect(calls[0]).toBeDefined();
    const options = calls[0]?.[1] ?? {};
    const headers = new Headers(options.headers ?? {});
    expect(headers.has('Content-Type')).toBe(false);
  });
});
