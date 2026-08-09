import { describe, expect, it, vi } from 'vitest';
import { EmptyResponseSchema } from '@cueq/shared';
import { createApiRequest } from './api-client';
import { registerApiClientTestCleanup } from './api-client-test-support';

describe('createApiRequest', () => {
  registerApiClientTestCleanup();

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

  it('reads an error response once and falls back when its JSON is malformed', async () => {
    const text = vi.fn<() => Promise<string>>().mockResolvedValue('{');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 502,
      text,
    } as unknown as Response);
    const apiRequest = createApiRequest('/api', '', 'Request failed.');

    await expect(apiRequest('/v1/dashboard/me', EmptyResponseSchema)).rejects.toMatchObject({
      message: '502: Request failed.',
      payload: null,
      status: 502,
    });
    expect(text).toHaveBeenCalledOnce();
  });
});
