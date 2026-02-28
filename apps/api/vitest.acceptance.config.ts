import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    fileParallelism: false,
    include: ['test/acceptance/**/*.test.ts'],
    exclude: ['**/dist/**', '**/.next/**', '**/node_modules/**'],
  },
});
