import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.smoke.test.ts', 'src/**/*.test.ts'],
    exclude: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      'test/acceptance/**/*.test.ts',
      'test/compliance/**/*.test.ts',
      'test/integration/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: [
        'src/common/auth/auth.service.ts',
        'src/common/auth/mock-identity-provider.adapter.ts',
        'src/common/auth/role-mapping.ts',
        'src/common/csv/parse-csv.ts',
        'src/common/filters/**/*.ts',
        'src/common/guards/**/*.ts',
        'src/common/http/**/*.ts',
        'src/common/integrations/integration-token.ts',
        'src/common/pipes/**/*.ts',
        'src/health/health.controller.ts',
        'src/phase2/helpers/booking-overlap.helper.ts',
        'src/phase2/helpers/closing-lifecycle.helper.ts',
        'src/phase2/helpers/closing-utils.ts',
        'src/phase2/helpers/role-constants.ts',
        'src/phase2/helpers/roster-utils.ts',
        'src/phase2/helpers/time-threshold-policy.helper.ts',
        'src/phase2/helpers/workflow-utils.ts',
      ],
      exclude: [
        'src/**/__tests__/**',
        'src/**/*.test.ts',
        'src/test-utils/**',
        'src/main.ts',
        'src/**/*.module.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70,
      },
    },
  },
});
