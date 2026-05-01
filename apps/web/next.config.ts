import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { buildSecurityHeaders } from './src/lib/security-headers';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const securityHeaders = buildSecurityHeaders({
  allowUnsafeEval: process.env.NODE_ENV !== 'production',
  includeContentSecurityPolicy: false,
});

const nextConfig: NextConfig = {
  // Enable React strict mode for better development warnings
  reactStrictMode: true,

  // Disable the X-Powered-By header
  poweredByHeader: false,

  // Transpile monorepo packages
  transpilePackages: ['@cueq/shared'],

  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },

  // Proxy API requests to the NestJS backend in development
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/:path*',
      },
    ];
  },
};

export default withNextIntl(nextConfig);
