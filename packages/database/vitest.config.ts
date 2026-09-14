import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '../../dist/document-storage.js': fileURLToPath(
        new URL('./src/document-storage.ts', import.meta.url),
      ),
      '../../dist/legacy-employment.js': fileURLToPath(
        new URL('./src/legacy-employment.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['test/**/*.integration.test.ts'],
    passWithNoTests: true,
  },
});
