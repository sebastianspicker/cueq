/** Shared-token verifier with timing-safe equal-length comparison and no production fallback credential. */
import { timingSafeEqual } from 'node:crypto';
import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';

function isNonProductionRuntime(): boolean {
  const runtime = (process.env.NODE_ENV ?? '').toLowerCase();
  return runtime === 'development' || runtime === 'test';
}

function tokenMatches(input: string, expected: string): boolean {
  const left = Buffer.from(input, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

/** Enforces the configured integration token and reports missing production configuration separately. */
export function assertIntegrationToken(
  token: string | string[] | undefined,
  envVar: string,
  fallback: string,
) {
  const configured = process.env[envVar]?.trim();
  const expected = configured || (isNonProductionRuntime() ? fallback : '');
  const normalized = Array.isArray(token) ? (token.length === 1 ? token[0] : undefined) : token;
  const received = normalized?.trim();

  if (!expected) {
    throw new InternalServerErrorException(`Missing integration token configuration: ${envVar}.`);
  }

  if (!received || !tokenMatches(received, expected)) {
    throw new ForbiddenException('Invalid integration token.');
  }
}
