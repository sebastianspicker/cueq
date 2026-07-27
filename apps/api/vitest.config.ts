import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.smoke.test.ts', 'src/**/*.test.ts'],
    exclude: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      'test/acceptance/**/*.test.ts',
      'test/compliance/**/*.test.ts',
      'test/integration/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/__tests__/**',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/test-utils/**',
        'src/commands/**',
        'src/main.ts',
        'src/openapi.ts',
        'src/**/*.module.ts',
        'src/**/*.dto.ts',
        'src/**/*.types.ts',
        'src/**/*.port.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 58,
        functions: 45,
        branches: 70,
        statements: 58,
      },
    },
  },
});
