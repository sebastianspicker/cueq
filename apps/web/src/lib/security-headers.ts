export interface SecurityHeader {
  key: string;
  value: string;
}

interface ContentSecurityPolicyOptions {
  allowUnsafeEval: boolean;
  nonce?: string;
}

interface SecurityHeadersOptions extends ContentSecurityPolicyOptions {
  includeContentSecurityPolicy?: boolean;
}

function joinDirective(name: string, values: string[]): string {
  return values.length > 0 ? `${name} ${values.join(' ')}` : name;
}

export function buildContentSecurityPolicy(options: ContentSecurityPolicyOptions): string {
  const scriptSrc = ["'self'"];
  const styleSrc = ["'self'"];
  if (options.nonce) {
    scriptSrc.push(`'nonce-${options.nonce}'`, "'strict-dynamic'");
    styleSrc.push(`'nonce-${options.nonce}'`);
  }
  if (options.allowUnsafeEval) {
    scriptSrc.push("'unsafe-eval'");
  }

  const directives: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    ['base-uri', ["'self'"]],
    ['script-src', scriptSrc],
    ['style-src', styleSrc],
    ['img-src', ["'self'", 'data:', 'blob:']],
    ['font-src', ["'self'", 'data:']],
    ['connect-src', ["'self'", 'http://localhost:3001', 'http://127.0.0.1:3001']],
    ['object-src', ["'none'"]],
    ['frame-ancestors', ["'none'"]],
    ['form-action', ["'self'"]],
  ];

  return directives.map(([name, values]) => joinDirective(name, values)).join('; ');
}

export function buildSecurityHeaders(options: SecurityHeadersOptions): SecurityHeader[] {
  const headers = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-XSS-Protection', value: '1; mode=block' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ];

  if (options.includeContentSecurityPolicy !== false) {
    headers.push({ key: 'Content-Security-Policy', value: buildContentSecurityPolicy(options) });
  }

  return headers;
}
