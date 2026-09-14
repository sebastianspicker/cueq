import { describe, expect, it, vi } from 'vitest';
import { ProjectReportService } from './project-report.service.js';
import { projectSummaryCsv, type ProjectEffortSummary } from './project-report-csv.js';

const projectId = 'c00000000000000000000001';
const query = { from: '2026-01-01T00:00:00.000Z', to: '2026-02-01T00:00:00.000Z' };

function service(population: number, recordedMinutes: number) {
  const tx = {
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([{ id: projectId }])
      .mockResolvedValueOnce([{ population, recordedMinutes }]),
    project: {
      findUnique: vi.fn().mockResolvedValue({
        id: projectId,
        code: 'P1',
        name: 'Project 1',
        parentId: null,
        budgetHours: { toNumber: () => 10 },
      }),
    },
  };
  const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
  const audit = { appendAudit: vi.fn().mockResolvedValue(undefined) };
  return { reports: new ProjectReportService(prisma as never, audit as never), tx, audit };
}

describe('project effort reporting privacy', () => {
  it('suppresses recorded totals, budget, and variance below the shared floor', async () => {
    const { reports, tx, audit } = service(4, 360);

    await expect(reports.summary('actor-1', projectId, query)).resolves.toMatchObject({
      suppression: { suppressed: true, minGroupSize: 5, population: 4 },
      totals: null,
    });
    expect(audit.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REPORT_ACCESSED',
        after: expect.objectContaining({ suppressed: true, population: 4 }),
      }),
      tx,
    );
  });

  it('returns aggregate hours without individual rankings at the privacy floor', async () => {
    const { reports } = service(5, 360);

    const summary = await reports.summary('actor-1', projectId, query);
    expect(summary).toMatchObject({
      suppression: { suppressed: false, population: 5 },
      totals: { budgetHours: 10, recordedHours: 6, varianceHours: 4 },
    });
    expect(summary).not.toHaveProperty('people');
    expect(summary).not.toHaveProperty('rankings');
  });

  it('escapes spreadsheet formulas in CSV text fields', () => {
    const summary: ProjectEffortSummary = {
      projectId,
      code: '=cmd',
      name: '+project',
      parentId: null,
      ...query,
      suppression: { suppressed: true, minGroupSize: 5, population: 1 },
      totals: null,
    };

    expect(projectSummaryCsv(summary)).toContain("'=cmd,'+project");
  });
});
