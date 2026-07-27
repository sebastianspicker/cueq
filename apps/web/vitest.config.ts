import { defineConfig } from 'vitest/config';

const specializedTestExcludes =
  process.env.CUEQ_INCLUDE_SPECIALIZED_TESTS === '1'
    ? []
    : [
        'src/**/*.integration.test.ts',
        'src/**/*.integration.test.tsx',
        'src/**/*.acceptance.test.ts',
        'src/**/*.acceptance.test.tsx',
        'src/**/*.compliance.test.ts',
        'src/**/*.compliance.test.tsx',
      ];

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/dist/**', '**/.next/**', '**/node_modules/**', ...specializedTestExcludes],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/__tests__/**',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.stories.tsx',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 20,
        functions: 45,
        branches: 70,
        statements: 20,
      },
    },
  },
});
