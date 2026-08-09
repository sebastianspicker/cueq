import { describe, expect, it, vi } from 'vitest';
import { createApiRequest } from './api-client';
import { UnknownResponseSchema, registerApiClientTestCleanup } from './api-client-test-support';

describe('createApiRequest', () => {
  registerApiClientTestCleanup();

  it('merges default and custom headers when init.headers is a Headers instance', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const apiRequest = createApiRequest('/api', 'mock-token', 'Request failed.');
    const customHeaders = new Headers({ 'X-Correlation-Id': 'req-123' });

    await apiRequest('/v1/dashboard/me', UnknownResponseSchema, {
      headers: customHeaders,
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const options = fetchSpy.mock.calls[0]?.[1] ?? {};
    const headers = new Headers(options.headers ?? {});
    expect(headers.get('Authorization')).toBe('Bearer mock-token');
    expect(headers.get('X-Correlation-Id')).toBe('req-123');
  });

  it('does not force content-type for bodyless requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const apiRequest = createApiRequest('/api', 'mock-token', 'Request failed.');
    await apiRequest('/v1/dashboard/me', UnknownResponseSchema);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const options = fetchSpy.mock.calls[0]?.[1] ?? {};
    const headers = new Headers(options.headers ?? {});
    expect(headers.has('Content-Type')).toBe(false);
  });

  it('infers JSON content-type only when a request body is present', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    const apiRequest = createApiRequest('/api', 'mock-token', 'Request failed.');

    await apiRequest('/v1/dashboard/me', UnknownResponseSchema, { body: '{}' });

    const options = fetchSpy.mock.calls[0]?.[1] ?? {};
    const headers = new Headers(options.headers ?? {});
    expect(headers.get('Content-Type')).toBe('application/json');
  });
});
