import { describe, expect, it } from 'vitest';
import {
  assertSafeApiBaseUrl,
  assertSafeApiRequestPath,
  buildApiHeaders,
  normalizeApiBaseUrl,
} from '../../src/platform/http/api-url-policy.js';
import {
  createContentSecurityPolicy,
  createContentSecurityPolicyNonce,
} from '../../src/platform/security/content-security-policy.js';

describe('browser API URL policy', () => {
  it('normalizes approved targets, protects authenticated headers, and rejects unsafe URLs', () => {
    expect(normalizeApiBaseUrl('/api/')).toBe('/api');
    expect(normalizeApiBaseUrl('')).toBe('/api');
    expect(buildApiHeaders('token', { body: '{}' }).get('Content-Type')).toBe('application/json');
    expect(
      buildApiHeaders('', { body: '{}', headers: { 'Content-Type': 'text/plain' } }).get(
        'Authorization',
      ),
    ).toBeNull();
    expect(
      buildApiHeaders('token', { headers: { 'Content-Type': 'text/plain' } }).get('Authorization'),
    ).toBe('Bearer token');

    expect(() => assertSafeApiBaseUrl('/api', 'https://cueq.example')).not.toThrow();
    expect(() =>
      assertSafeApiBaseUrl('https://cueq.example/api', 'https://cueq.example'),
    ).not.toThrow();
    expect(() =>
      assertSafeApiBaseUrl('https://user:pass@cueq.example/api', 'https://cueq.example'),
    ).toThrow('Unsafe API base URL.');
    expect(() => assertSafeApiBaseUrl('https://other.example/api', 'https://cueq.example')).toThrow(
      'Unsafe API base URL.',
    );
    expect(() => assertSafeApiBaseUrl('https://cueq.example/api', undefined)).toThrow(
      'Unsafe API base URL.',
    );
    expect(() => assertSafeApiBaseUrl('not a URL', 'https://cueq.example')).toThrow(
      'Unsafe API base URL.',
    );
    expect(() => assertSafeApiBaseUrl('https://cueq.example\\api', 'https://cueq.example')).toThrow(
      'Unsafe API base URL.',
    );
    expect(() => assertSafeApiRequestPath('/v1/absences')).not.toThrow();
    expect(() => assertSafeApiRequestPath('//other.example')).toThrow('Unsafe API request path.');
    expect(() => assertSafeApiRequestPath('https://other.example')).toThrow(
      'Unsafe API request path.',
    );
  });
});

describe('content security policy', () => {
  it('keeps production restrictive while allowing development tooling only in development', () => {
    const nonce = createContentSecurityPolicyNonce();
    const production = createContentSecurityPolicy('nonce-value', false);
    const development = createContentSecurityPolicy('nonce-value', true);

    expect(production).toContain("default-src 'none'");
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/u);
    expect(nonce).not.toBe(createContentSecurityPolicyNonce());
    expect(production).toContain("script-src 'nonce-nonce-value' 'strict-dynamic' 'self'");
    expect(production).toContain("connect-src 'self'");
    expect(production).not.toContain("'unsafe-eval'");
    expect(production).not.toContain('wss:');
    expect(development).toContain("'unsafe-eval'");
    expect(development).toContain("connect-src 'self' ws: wss:");
  });
});
