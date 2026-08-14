import { describe, expect, it, vi } from 'vitest';
import { createApiRequest } from './api-client';
import { UnknownResponseSchema, registerApiClientTestCleanup } from './api-client-test-support';

describe('createApiRequest', () => {
  registerApiClientTestCleanup();

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
});
