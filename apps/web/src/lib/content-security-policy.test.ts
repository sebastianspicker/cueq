import { describe, expect, it } from 'vitest';
import {
  createContentSecurityPolicy,
  createContentSecurityPolicyNonce,
} from './content-security-policy';

function directive(policy: string, name: string) {
  return policy.split('; ').find((entry) => entry.startsWith(`${name} `));
}

describe('content security policy', () => {
  it('creates unique 128-bit request nonces', () => {
    const first = createContentSecurityPolicyNonce();
    const second = createContentSecurityPolicyNonce();

    expect(first).not.toBe(second);
    expect(atob(first)).toHaveLength(16);
    expect(atob(second)).toHaveLength(16);
  });

  it('enforces nonce-based scripts and same-origin connections in production', () => {
    const policy = createContentSecurityPolicy('test-nonce', false);

    expect(directive(policy, 'script-src')).toBe(
      "script-src 'nonce-test-nonce' 'strict-dynamic' 'self'",
    );
    expect(directive(policy, 'script-src')).not.toContain("'unsafe-inline'");
    expect(directive(policy, 'script-src')).not.toContain("'unsafe-eval'");
    expect(directive(policy, 'connect-src')).toBe("connect-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("base-uri 'none'");
  });

  it('adds only the script and connection allowances required by development', () => {
    const policy = createContentSecurityPolicy('test-nonce', true);

    expect(directive(policy, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(policy, 'connect-src')).toBe("connect-src 'self' ws: wss:");
  });
});
