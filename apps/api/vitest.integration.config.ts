import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.integration.test.ts'],
    testTimeout: 20_000,
    env: {
      AUTH_PROVIDER: 'mock',
      NODE_ENV: 'test',
    },
  },
});
