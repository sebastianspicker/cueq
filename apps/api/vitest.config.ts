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
      // Database-free boundary coverage: local auth claims, HTTP policy and
      // validation, and deterministic integration protocol/security helpers.
      // Storage orchestration requires the explicit PostgreSQL integration lane;
      // test:coverage:all keeps the remaining full-source gap visible.
      include: [
        'src/platform/http/cors-options.ts',
        'src/platform/http/development-listen-host.ts',
        'src/platform/http/validation/**/*.ts',
        'src/platform/auth/role-mapping.ts',
        'src/platform/auth/mock-identity-provider.adapter.ts',
        'src/modules/integrations/csv/**/*.ts',
        'src/modules/integrations/credentials/**/*.ts',
        'src/modules/integrations/terminal-contracts.ts',
        'src/modules/integrations/terminal-csv-parser.ts',
        'src/modules/integrations/terminal-import-normalization.ts',
        'src/modules/integrations/webhook-dispatch-format.ts',
        'src/modules/integrations/webhooks/webhook-secret-envelope.ts',
        'src/modules/integrations/webhooks/webhook-url.ts',
      ],
      exclude: [
        'src/**/__tests__/**',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/test-utils/**',
        'src/commands/**',
        'src/main.ts',
        'src/openapi.ts',
        'src/**/*.module.ts',
        'src/**/*.dto.ts',
        'src/**/*.types.ts',
        'src/**/*.port.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 89,
        functions: 94,
        branches: 75,
        statements: 89,
      },
    },
  },
});
