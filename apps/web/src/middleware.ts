import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import {
  createContentSecurityPolicy,
  createContentSecurityPolicyNonce,
} from './platform/security/content-security-policy';

const handleI18nRouting = createMiddleware({
  locales: ['de', 'en'],
  defaultLocale: 'de',
  localePrefix: 'always',
});

/** Applies locale routing and one nonce-bearing policy to each localized document. */
export default function middleware(request: NextRequest) {
  const nonce = createContentSecurityPolicyNonce();
  const policy = createContentSecurityPolicy(nonce, process.env.NODE_ENV === 'development');
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set('content-security-policy', policy);
  requestHeaders.set('x-nonce', nonce);

  const response = handleI18nRouting(new NextRequest(request, { headers: requestHeaders }));
  response.headers.set('content-security-policy', policy);
  response.headers.set('cache-control', 'private, no-store');
  return response;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
