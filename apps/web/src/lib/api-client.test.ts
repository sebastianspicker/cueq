import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmptyResponseSchema, UserIdentitySchema } from '@cueq/shared';
import { ApiContractError, createApiFetch, createApiRequest } from './api-client';

const UnknownResponseSchema = {
  parse(input: unknown): unknown {
    return input;
  },
};

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

  it('supports relative api base urls by default', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const apiRequest = createApiRequest('/api', 'mock-token', 'Request failed.');
    await apiRequest('/v1/dashboard/me', UnknownResponseSchema);

    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/dashboard/me', expect.any(Object));
  });

  it('rejects untrusted absolute api base urls before sending credentials', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const apiRequest = createApiRequest(
      'https://attacker.example',
      'mock-token',
      'Request failed.',
    );

    await expect(apiRequest('/v1/dashboard/me', UnknownResponseSchema)).rejects.toThrow(
      'Unsafe API base URL',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    '//attacker.example',
    '/\\attacker.example',
    'https://user:password@attacker.example',
    'http://localhost:3001',
    'https://127.0.0.1:3001',
    '/api\u0000',
    '/api\n',
    '\t/api',
  ])('rejects unsafe base %s before sending credentials', async (baseUrl) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const apiRequest = createApiRequest(baseUrl, 'secret-token', 'Request failed.');

    await expect(apiRequest('/v1/dashboard/me', UnknownResponseSchema)).rejects.toThrow(
      'Unsafe API base URL',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('allows an absolute base only when it matches the browser origin', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    const apiRequest = createApiRequest(
      `${window.location.origin}/api`,
      'mock-token',
      'Request failed.',
    );

    await apiRequest('/v1/dashboard/me', UnknownResponseSchema);

    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('rejects absolute request paths before calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const apiRequest = createApiRequest('/api', 'mock-token', 'Request failed.');

    await expect(
      apiRequest('https://attacker.example/v1/dashboard/me', UnknownResponseSchema),
    ).rejects.toThrow('Unsafe API request path');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(['//attacker.example/path', '/\\attacker.example/path', '/safe\u0000'])(
    'rejects unsafe request path %s before sending credentials',
    async (path) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const apiRequest = createApiRequest('/api', 'secret-token', 'Request failed.');

      await expect(apiRequest(path, UnknownResponseSchema)).rejects.toThrow(
        'Unsafe API request path',
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it('rejects malformed successful JSON without exposing its body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{', { status: 200 }));
    const apiRequest = createApiRequest('/api', '', 'Request failed.');

    await expect(apiRequest('/v1/dashboard/me', UserIdentitySchema)).rejects.toBeInstanceOf(
      ApiContractError,
    );
  });

  it('rejects successful payloads that do not match their schema', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":1}', { status: 200 }));
    const apiRequest = createApiRequest('/api', '', 'Request failed.');

    await expect(apiRequest('/v1/dashboard/me', UserIdentitySchema)).rejects.toBeInstanceOf(
      ApiContractError,
    );
  });

  it('accepts an empty successful response only when its schema accepts null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const apiRequest = createApiRequest('/api', '', 'Request failed.');

    await expect(apiRequest('/v1/dashboard/me', EmptyResponseSchema)).resolves.toBeNull();
    await expect(apiRequest('/v1/dashboard/me', UserIdentitySchema)).rejects.toThrow(
      ApiContractError,
    );
  });

  it('uses only validated API error fields and drops arbitrary response data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        '{"message":"Safe conflict message","code":"WRITE_CONFLICT","secret":"discard-me"}',
        { status: 409 },
      ),
    );
    const apiRequest = createApiRequest('/api', '', 'Request failed.');

    await expect(apiRequest('/v1/dashboard/me', EmptyResponseSchema)).rejects.toMatchObject({
      message: '409: Safe conflict message',
      payload: { code: 'WRITE_CONFLICT', message: 'Safe conflict message' },
      status: 409,
    });
  });

  it('retains sanitized schema issue paths without retaining response values', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":1}', { status: 200 }));
    const apiRequest = createApiRequest('/api', '', 'Request failed.');

    await expect(apiRequest('/v1/dashboard/me', UserIdentitySchema)).rejects.toMatchObject({
      issues: [{ code: 'invalid_type', path: 'id' }],
    });
  });
});

describe('createApiFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a raw response while retaining the credential boundary', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('export-body', { status: 200, headers: { 'content-type': 'text/plain' } }),
      );
    const apiFetch = createApiFetch('/api', 'download-token');

    await expect(apiFetch('/v1/export-runs/run-1/artifact')).resolves.toBeInstanceOf(Response);

    const headers = new Headers(fetchSpy.mock.calls[0]?.[1]?.headers);
    expect(headers.get('Authorization')).toBe('Bearer download-token');
  });

  it('rejects a hostile download base before fetch can receive the bearer token', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const apiFetch = createApiFetch('https://attacker.example', 'download-token');

    await expect(apiFetch('/v1/export-runs/run-1/artifact')).rejects.toThrow('Unsafe API base URL');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
