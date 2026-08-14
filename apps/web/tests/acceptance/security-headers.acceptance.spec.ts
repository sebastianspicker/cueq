import { expect, test } from '@playwright/test';

function policyNonce(policy: string) {
  return policy.match(/(?:^|; )script-src [^;]*'nonce-([^']+)'/)?.[1];
}

test.describe('browser security headers', () => {
  test('enforces one matching nonce across the localized document', async ({ page, request }) => {
    const policyViolations: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && /content security policy/i.test(message.text())) {
        policyViolations.push(message.text());
      }
    });

    const navigation = await page.goto('/de/dashboard');
    expect(navigation).not.toBeNull();
    const policy = navigation?.headers()['content-security-policy'] ?? '';
    const nonce = policyNonce(policy);

    expect(nonce).toBeTruthy();
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).not.toContain("script-src 'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(navigation?.headers()['content-security-policy-report-only']).toBeUndefined();
    expect(navigation?.headers()['cache-control']).toContain('no-store');

    const scriptNonces = await page
      .locator('script')
      .evaluateAll((scripts) => scripts.map((script) => (script as HTMLScriptElement).nonce));
    expect(scriptNonces.length).toBeGreaterThan(0);
    expect(new Set(scriptNonces)).toEqual(new Set([nonce]));
    expect(policyViolations).toEqual([]);

    const secondResponse = await request.get('/en/dashboard');
    const secondPolicy = secondResponse.headers()['content-security-policy'] ?? '';
    expect(policyNonce(secondPolicy)).toBeTruthy();
    expect(policyNonce(secondPolicy)).not.toBe(nonce);

    const localeRedirect = await request.get('/', {
      headers: { 'accept-language': 'en' },
      maxRedirects: 0,
    });
    expect(localeRedirect.status()).toBe(307);
    expect(localeRedirect.headers()['location']).toBe('/en');
    expect(localeRedirect.headers()['content-security-policy']).toContain("default-src 'none'");
  });
});
