import { defineConfig } from 'vitest/config';

const specializedTestExcludes =
  process.env.CUEQ_INCLUDE_SPECIALIZED_TESTS === '1'
    ? ['src/**/*.integration.test.ts']
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
    exclude: ['**/dist/**', '**/.next/**', '**/node_modules/**', ...specializedTestExcludes],
    coverage: {
      provider: 'v8',
      include: ['src/index.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
