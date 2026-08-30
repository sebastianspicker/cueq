import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertIntegrationToken } from './integration-token.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('integration token boundary', () => {
  it('uses a test-only fallback, normalizes one header value, and rejects invalid tokens', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('CUEQ_TEST_TOKEN', '');

    expect(() =>
      assertIntegrationToken([' fallback-token '], 'CUEQ_TEST_TOKEN', 'fallback-token'),
    ).not.toThrow();
    expect(() => assertIntegrationToken('wrong', 'CUEQ_TEST_TOKEN', 'fallback-token')).toThrow(
      ForbiddenException,
    );
    expect(() =>
      assertIntegrationToken(
        ['fallback-token', 'fallback-token'],
        'CUEQ_TEST_TOKEN',
        'fallback-token',
      ),
    ).toThrow(ForbiddenException);
  });

  it('requires an explicit production token configuration', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CUEQ_TEST_TOKEN', '');

    expect(() =>
      assertIntegrationToken('fallback-token', 'CUEQ_TEST_TOKEN', 'fallback-token'),
    ).toThrow(InternalServerErrorException);
  });
});
