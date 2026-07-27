import { describe, expect, it } from 'vitest';
import { HealthController } from '../src/health/health.controller.js';

describe('@cueq/api smoke test', () => {
  it('returns a public liveness payload without operational details', async () => {
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
    expect(result).not.toHaveProperty('operations');
  });

  it('returns operational details on the readiness endpoint', async () => {
    const controller = new HealthController({
      exportRun: { findFirst: async () => null },
      hrImportRun: { findFirst: async () => null },
      auditEntry: { findFirst: async () => null },
      terminalDevice: { findMany: async () => [] },
    } as never);
    const result = await controller.readiness();

    expect(result.status).toBe('ok');
    expect(result.degraded).toBe(false);
    expect(result.degradedReasons).toEqual([]);
    expect(result.operations).toBeDefined();
  });

  it('marks readiness degraded when a terminal heartbeat is stale', async () => {
    const controller = new HealthController({
      exportRun: { findFirst: async () => null },
      hrImportRun: { findFirst: async () => null },
      auditEntry: { findFirst: async () => null },
      terminalDevice: {
        findMany: async () => [
          {
            lastSeenAt: new Date('2000-01-01T00:00:00.000Z'),
          },
        ],
      },
    } as never);
    const result = await controller.readiness();

    expect(result.status).toBe('degraded');
    expect(result.degraded).toBe(true);
    expect(result.degradedReasons).toContain('STALE_TERMINALS');
    expect(result.operations.terminal.stale).toBe(1);
  });

  it('marks readiness degraded when the latest HR import failed', async () => {
    const controller = new HealthController({
      exportRun: { findFirst: async () => null },
      hrImportRun: {
        findFirst: async () => ({
          importedAt: new Date('2026-05-16T00:00:00.000Z'),
          status: 'FAILED',
        }),
      },
      auditEntry: { findFirst: async () => null },
      terminalDevice: { findMany: async () => [] },
    } as never);
    const result = await controller.readiness();

    expect(result.status).toBe('degraded');
    expect(result.degraded).toBe(true);
    expect(result.degradedReasons).toContain('FAILED_HR_IMPORT');
    expect(result.operations.hrImport.lastStatus).toBe('FAILED');
  });
});
