import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'src/**/*.integration.test.ts',
      'src/**/*.acceptance.test.ts',
      'src/**/*.compliance.test.ts',
    ],
    exclude: ['**/dist/**', '**/node_modules/**'],
  },
});
