import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // This is platform-boundary coverage, not whole-UI coverage.
      include: [
        'src/platform/http/api-url-policy.ts',
        'src/platform/security/content-security-policy.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 95,
        statements: 100,
      },
    },
  },
});
