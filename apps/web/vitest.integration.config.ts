import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.integration.test.ts', 'src/**/*.integration.test.tsx'],
    exclude: ['**/dist/**', '**/.next/**', '**/node_modules/**'],
  },
});
