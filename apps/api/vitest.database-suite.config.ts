import { defineConfig } from 'vitest/config';

type DatabaseTestSuite = 'acceptance' | 'compliance' | 'integration';

const DATABASE_TEST_EXCLUDES = ['**/dist/**', '**/.next/**', '**/node_modules/**'];

export function defineDatabaseTestConfig(suite: DatabaseTestSuite) {
  return defineConfig({
    test: {
      environment: 'node',
      globals: true,
      fileParallelism: false,
      hookTimeout: 30_000,
      testTimeout: 60_000,
      setupFiles: [`test/setup/${suite}-db.setup.ts`],
      include: [`test/${suite}/**/*.test.ts`],
      exclude: DATABASE_TEST_EXCLUDES,
    },
  });
}
