import { describe, expect, it } from 'vitest';
import { buildCorsOptions } from './cors-options';

function allowOrigin(options: ReturnType<typeof buildCorsOptions>, origin: string | undefined) {
  return new Promise<boolean>((resolve, reject) => {
    const resolver = options.origin;
    if (typeof resolver !== 'function') {
      reject(new Error('Expected functional CORS origin resolver.'));
      return;
    }

    resolver(origin, (error: Error | null, allowed?: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(Boolean(allowed));
    });
  });
}

describe('buildCorsOptions', () => {
  it('allows localhost origins in non-production by default', async () => {
    const options = buildCorsOptions({ NODE_ENV: 'development' });
    await expect(allowOrigin(options, 'http://localhost:3000')).resolves.toBe(true);
    await expect(allowOrigin(options, 'https://attacker.example')).resolves.toBe(false);
  });

  it('blocks cross-origin requests in production without explicit allowlist', async () => {
    const options = buildCorsOptions({ NODE_ENV: 'production' });
    await expect(allowOrigin(options, 'https://app.example')).resolves.toBe(false);
  });

  it('allows explicitly configured origins and strips trailing slash', async () => {
    const options = buildCorsOptions({
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://app.example/,https://admin.example',
    });

    await expect(allowOrigin(options, 'https://app.example')).resolves.toBe(true);
    await expect(allowOrigin(options, 'https://admin.example')).resolves.toBe(true);
    await expect(allowOrigin(options, 'https://unknown.example')).resolves.toBe(false);
  });

  it('rejects invalid wildcard+credentials configuration', () => {
    expect(() =>
      buildCorsOptions({
        NODE_ENV: 'production',
        CORS_ORIGINS: '*',
        CORS_ALLOW_CREDENTIALS: 'true',
      }),
    ).toThrow(/cannot be combined/iu);
  });
});
