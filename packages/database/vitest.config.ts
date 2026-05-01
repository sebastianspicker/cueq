import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    exclude: ['**/dist/**', '**/.next/**', '**/node_modules/**', 'src/**/*.integration.test.ts'],
  },
});
