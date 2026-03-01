import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const DEFAULT_DEV_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
]);

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/u, '');
}

function parseOrigins(input: string | undefined): Set<string> {
  if (!input) {
    return new Set();
  }

  return new Set(
    input
      .split(',')
      .map((origin) => normalizeOrigin(origin))
      .filter((origin) => origin.length > 0),
  );
}

function isProductionRuntime(env: NodeJS.ProcessEnv): boolean {
  return (env.NODE_ENV ?? '').toLowerCase() === 'production';
}

export function buildCorsOptions(env: NodeJS.ProcessEnv = process.env): CorsOptions {
  const configuredOrigins = parseOrigins(env.CORS_ORIGINS);
  const allowCredentials = (env.CORS_ALLOW_CREDENTIALS ?? '').toLowerCase() === 'true';
  const wildcardConfigured = configuredOrigins.has('*');

  if (wildcardConfigured && allowCredentials) {
    throw new Error(
      'Invalid CORS config: CORS_ORIGINS=* cannot be combined with CORS_ALLOW_CREDENTIALS=true.',
    );
  }

  const allowAllOrigins = wildcardConfigured;
  const allowlist =
    configuredOrigins.size > 0
      ? new Set([...configuredOrigins].filter((origin) => origin !== '*'))
      : isProductionRuntime(env)
        ? new Set<string>()
        : new Set(DEFAULT_DEV_ORIGINS);

  return {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowAllOrigins) {
        callback(null, true);
        return;
      }

      callback(null, allowlist.has(normalizeOrigin(origin)));
    },
    credentials: allowCredentials,
  };
}
