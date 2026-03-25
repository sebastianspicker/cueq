import { describe, expect, it } from 'vitest';
import { ApiErrorSchema } from '../schemas/common';

describe('@cueq/shared compliance', () => {
  it('supports correlation IDs in API error envelopes', () => {
    const value = ApiErrorSchema.parse({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Role does not permit access.',
      correlationId: 'corr-123',
    });

    expect(value.correlationId).toBe('corr-123');
  });
});
