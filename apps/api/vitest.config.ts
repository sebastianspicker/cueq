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
  },
});
