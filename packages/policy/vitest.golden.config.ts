import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/__tests__/golden-cases.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
  },
});
