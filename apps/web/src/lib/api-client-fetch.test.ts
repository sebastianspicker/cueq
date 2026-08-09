import { describe, expect, it, vi } from 'vitest';
import { createApiFetch } from './api-client';
import { registerApiClientTestCleanup } from './api-client-test-support';

describe('createApiFetch', () => {
  registerApiClientTestCleanup();

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
