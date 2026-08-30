const NONCE_BYTES = 16;

/** Creates an unpredictable request-scoped nonce for executable browser content. */
export function createContentSecurityPolicyNonce(): string {
  const bytes = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function createContentSecurityPolicy(nonce: string, development: boolean): string {
  const scriptSources = [`'nonce-${nonce}'`, "'strict-dynamic'", "'self'"];
  const connectSources = ["'self'"];

  if (development) {
    scriptSources.push("'unsafe-eval'");
    connectSources.push('ws:', 'wss:');
  }

  return [
    "default-src 'none'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connectSources.join(' ')}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}
