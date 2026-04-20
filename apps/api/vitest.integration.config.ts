import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 60_000,
    setupFiles: ['test/setup/integration-db.setup.ts'],
    include: ['test/integration/**/*.test.ts'],
    exclude: ['**/dist/**', '**/.next/**', '**/node_modules/**'],
  },
});
