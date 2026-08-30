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
      exclude: [
        'src/**/__tests__/**',
        'src/index.ts',
        'src/generated/**',
        'src/types.ts',
        'src/**/*.typecheck.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
