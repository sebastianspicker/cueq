import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, buildSecurityHeaders } from './security-headers';

describe('security headers', () => {
  it('includes a Content-Security-Policy header with frame and object restrictions', () => {
    const cspHeader = buildSecurityHeaders({ allowUnsafeEval: false }).find(
      (header) => header.key === 'Content-Security-Policy',
    );

    expect(cspHeader).toBeDefined();
    expect(cspHeader?.value).toContain("object-src 'none'");
    expect(cspHeader?.value).toContain("frame-ancestors 'none'");
  });

  it('excludes unsafe-eval from the production CSP', () => {
    expect(buildContentSecurityPolicy({ allowUnsafeEval: false })).not.toContain("'unsafe-eval'");
  });

  it('adds script and style nonces when provided', () => {
    const policy = buildContentSecurityPolicy({ allowUnsafeEval: false, nonce: 'test-nonce' });

    expect(policy).toContain("script-src 'self' 'nonce-test-nonce' 'strict-dynamic'");
    expect(policy).toContain("style-src 'self' 'nonce-test-nonce'");
  });

  it('can allow unsafe-eval for development compatibility', () => {
    expect(buildContentSecurityPolicy({ allowUnsafeEval: true })).toContain("'unsafe-eval'");
  });
});
