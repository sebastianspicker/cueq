import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiRequest } from './api-client';

describe('createApiRequest', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('merges default and custom headers when init.headers is a Headers instance', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const apiRequest = createApiRequest('http://localhost:3001', 'mock-token', 'Request failed.');
    const customHeaders = new Headers({ 'X-Correlation-Id': 'req-123' });

    await apiRequest('/v1/dashboard/me', {
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

    const apiRequest = createApiRequest('http://localhost:3001', 'mock-token', 'Request failed.');
    await apiRequest('/v1/dashboard/me');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const options = fetchSpy.mock.calls[0]?.[1] ?? {};
    const headers = new Headers(options.headers ?? {});
    expect(headers.has('Content-Type')).toBe(false);
  });

  it('supports relative api base urls by default', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const apiRequest = createApiRequest('/api', 'mock-token', 'Request failed.');
    await apiRequest('/v1/dashboard/me');

    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/dashboard/me', expect.any(Object));
  });
});
