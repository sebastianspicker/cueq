import { vi } from 'vitest';
import { HrImportService } from './hr-import.service.js';
import type { HrMasterProviderPort } from './hr-master-provider.port.js';

function createRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    source: 'FILE',
    sourceFile: null,
    status: 'SUCCEEDED',
    totalRows: 0,
    createdRows: 0,
    updatedRows: 0,
    skippedRows: 0,
    errorCount: 0,
    summary: {},
    importedAt: new Date('2026-04-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function createService(txOverrides: Record<string, unknown> = {}) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
    organizationUnit: { upsert: vi.fn().mockResolvedValue({}) },
    workTimeModel: { upsert: vi.fn().mockResolvedValue({}) },
    hrImportRun: { create: vi.fn(async ({ data }) => createRun(data)) },
    auditEntry: { create: vi.fn().mockResolvedValue({}) },
    person: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
    },
    ...txOverrides,
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    hrImportRun: { findUnique: vi.fn() },
  };
  const provider: HrMasterProviderPort = { fetchMasterRecords: vi.fn() };
  const auditHelper = { appendAudit: vi.fn().mockResolvedValue(undefined) };
  const service = new HrImportService(prisma as never, provider, auditHelper as never);

  return { service, prisma, tx, auditHelper };
}
