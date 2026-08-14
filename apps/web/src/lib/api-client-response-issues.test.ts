import { describe, expect, it, vi } from 'vitest';
import { UserIdentitySchema } from '@cueq/shared';
import { createApiRequest } from './api-client';
import { registerApiClientTestCleanup } from './api-client-test-support';

describe('createApiRequest', () => {
  registerApiClientTestCleanup();

  it('retains sanitized schema issue paths without retaining response values', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":1}', { status: 200 }));
    const apiRequest = createApiRequest('/api', '', 'Request failed.');

    await expect(apiRequest('/v1/dashboard/me', UserIdentitySchema)).rejects.toMatchObject({
      issues: [{ code: 'invalid_type', path: 'id' }],
    });
  });

  it('preserves contract issue truncation and path normalization', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const apiRequest = createApiRequest('/api', '', 'Request failed.');
    const schema = {
      parse() {
        throw {
          issues: [
            {
              code: 'x'.repeat(101),
              path: [1, { discarded: true }, 'field'],
            },
          ],
        };
      },
    };

    await expect(apiRequest('/v1/dashboard/me', schema)).rejects.toMatchObject({
      issues: [{ code: 'x'.repeat(100), path: '1.field' }],
    });
  });
});
