import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { buildCorsOptions } from './cors-options.js';
import { resolveDevelopmentListenHost } from './development-listen-host.js';
import { ParseCuidPipe } from './validation/parse-cuid.pipe.js';
import { ZodValidationPipe } from './validation/zod-validation.pipe.js';

async function isOriginAllowed(
  options: ReturnType<typeof buildCorsOptions>,
  origin: string | undefined,
): Promise<boolean> {
  const resolver = options.origin as (
    requestOrigin: string | undefined,
    callback: (error: Error | null, allowed?: boolean) => void,
  ) => void;
  return new Promise((resolve, reject) => {
    resolver(origin, (error, allowed) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(allowed === true);
    });
  });
}

describe('HTTP boundary policy', () => {
  it('fails closed in production while normalizing configured browser origins', async () => {
    const production = buildCorsOptions({
      NODE_ENV: 'production',
      CORS_ORIGINS: ' https://cueq.example/ , https://admin.example ',
      CORS_ALLOW_CREDENTIALS: 'true',
    });

    expect(production.credentials).toBe(true);
    await expect(isOriginAllowed(production, 'https://cueq.example/')).resolves.toBe(true);
    await expect(isOriginAllowed(production, 'https://untrusted.example')).resolves.toBe(false);
    await expect(
      isOriginAllowed(buildCorsOptions({ NODE_ENV: 'production' }), undefined),
    ).resolves.toBe(true);
    expect(() => buildCorsOptions({ CORS_ORIGINS: '*', CORS_ALLOW_CREDENTIALS: 'true' })).toThrow(
      'CORS_ORIGINS=* cannot be combined',
    );
  });

  it('keeps the development bind host local and validates route/body inputs before handlers', () => {
    expect(resolveDevelopmentListenHost({})).toBe('127.0.0.1');
    expect(resolveDevelopmentListenHost({ CUEQ_DEV_HOST: '0.0.0.0' })).toBe('0.0.0.0');
    expect(resolveDevelopmentListenHost({ NODE_ENV: 'production' })).toBeUndefined();

    const cuid = 'c123456789012345678901234';
    expect(new ParseCuidPipe().transform(cuid)).toBe(cuid);
    expect(() => new ParseCuidPipe().transform('not-a-cuid')).toThrow(BadRequestException);

    const pipe = new ZodValidationPipe(z.object({ count: z.coerce.number().int().positive() }));
    expect(pipe.transform({ count: '2' })).toEqual({ count: 2 });
    expect(() => pipe.transform({ count: 0 })).toThrow(BadRequestException);
  });
});
