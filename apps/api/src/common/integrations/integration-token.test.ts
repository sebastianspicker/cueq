import { afterEach, describe, expect, it } from 'vitest';
import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { assertIntegrationToken } from './integration-token';

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  HR_IMPORT_TOKEN: process.env.HR_IMPORT_TOKEN,
};

function restoreEnv() {
  if (ORIGINAL_ENV.NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
  }

  if (ORIGINAL_ENV.HR_IMPORT_TOKEN === undefined) {
    delete process.env.HR_IMPORT_TOKEN;
  } else {
    process.env.HR_IMPORT_TOKEN = ORIGINAL_ENV.HR_IMPORT_TOKEN;
  }
}

describe('integration token guard', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('accepts explicitly configured token', () => {
    process.env.NODE_ENV = 'production';
    process.env.HR_IMPORT_TOKEN = 'strong-token';

    expect(() =>
      assertIntegrationToken('strong-token', 'HR_IMPORT_TOKEN', 'dev-hr-token'),
    ).not.toThrow();
  });

  it('rejects incorrect token value', () => {
    process.env.NODE_ENV = 'production';
    process.env.HR_IMPORT_TOKEN = 'strong-token';

    expect(() => assertIntegrationToken('wrong-token', 'HR_IMPORT_TOKEN', 'dev-hr-token')).toThrow(
      ForbiddenException,
    );
  });

  it('rejects requests with multiple integration-token header values', () => {
    process.env.NODE_ENV = 'production';
    process.env.HR_IMPORT_TOKEN = 'strong-token';

    expect(() =>
      assertIntegrationToken(['strong-token', 'strong-token'], 'HR_IMPORT_TOKEN', 'dev-hr-token'),
    ).toThrow(ForbiddenException);
  });

  it('accepts configured token when incoming header contains surrounding whitespace', () => {
    process.env.NODE_ENV = 'production';
    process.env.HR_IMPORT_TOKEN = 'strong-token';

    expect(() =>
      assertIntegrationToken('  strong-token  ', 'HR_IMPORT_TOKEN', 'dev-hr-token'),
    ).not.toThrow();
  });

  it('uses fallback token only in non-production runtimes', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.HR_IMPORT_TOKEN;

    expect(() =>
      assertIntegrationToken('dev-hr-token', 'HR_IMPORT_TOKEN', 'dev-hr-token'),
    ).not.toThrow();
  });

  it('fails closed when production token is missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.HR_IMPORT_TOKEN;

    expect(() => assertIntegrationToken('dev-hr-token', 'HR_IMPORT_TOKEN', 'dev-hr-token')).toThrow(
      InternalServerErrorException,
    );
  });

  it('fails closed when NODE_ENV is missing and token is not configured', () => {
    delete process.env.NODE_ENV;
    delete process.env.HR_IMPORT_TOKEN;

    expect(() => assertIntegrationToken('dev-hr-token', 'HR_IMPORT_TOKEN', 'dev-hr-token')).toThrow(
      InternalServerErrorException,
    );
  });
});
