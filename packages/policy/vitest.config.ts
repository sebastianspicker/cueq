import { defineConfig } from 'vitest/config';

const specializedTestExcludes =
  process.env.CUEQ_INCLUDE_SPECIALIZED_TESTS === '1'
    ? []
    : [
        'src/**/*.integration.test.ts',
        'src/**/*.acceptance.test.ts',
        'src/**/*.compliance.test.ts',
      ];

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**', ...specializedTestExcludes],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 85,
        functions: 75,
        branches: 80,
        statements: 85,
      },
    },
  },
});
