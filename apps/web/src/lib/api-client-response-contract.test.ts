import { describe, expect, it, vi } from 'vitest';
import { EmptyResponseSchema, UserIdentitySchema } from '@cueq/shared';
import { ApiContractError, createApiRequest } from './api-client';
import { registerApiClientTestCleanup } from './api-client-test-support';

describe('createApiRequest', () => {
  registerApiClientTestCleanup();

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
});
