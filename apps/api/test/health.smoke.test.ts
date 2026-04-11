import { describe, expect, it } from 'vitest';
import { HealthController } from '../src/health/health.controller';

describe('@cueq/api smoke test', () => {
  it('returns a healthy status payload', async () => {
    const controller = new HealthController({
      exportRun: { findFirst: async () => null },
      hrImportRun: { findFirst: async () => null },
      auditEntry: { findFirst: async () => null },
      terminalDevice: { findMany: async () => [] },
    } as never);
    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.timestamp).toBeTypeOf('string');
    expect(result.version).toBeTypeOf('string');
    expect(result.operations).toBeDefined();
  });
});
