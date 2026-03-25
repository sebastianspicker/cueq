import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/__tests__/golden-cases.test.ts', '**/dist/**', '**/node_modules/**'],
  },
});
