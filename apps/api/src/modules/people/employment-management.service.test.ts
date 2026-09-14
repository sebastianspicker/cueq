import { describe, expect, it, vi } from 'vitest';
import { EmploymentManagementService } from './employment-management.service.js';

const id = 'c000000000000000000000001';
const boundary = new Date('2099-02-01T00:00:00Z');
const payload = {
  effectiveFrom: boundary.toISOString(),
  effectiveTo: null,
  organizationUnitId: id,
  supervisorId: null,
  workTimeModelId: null,
  weeklyHours: 20,
  dailyTargetHours: 4,
  workingDays: [1, 2, 3, 4, 5],
  employmentGroupId: id,
  holidayCalendarId: id,
  policyReferences: {},
};
function fixture(crossing: boolean) {
  const reference = { findUnique: vi.fn().mockResolvedValue({ id }) };
  const empty = { findFirst: vi.fn().mockResolvedValue(null) };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id, acquired: true }]),
    employmentAssignment: {
      findUnique: vi.fn().mockResolvedValue({ id, personId: id, employmentEndDate: null }),
    },
    organizationUnit: reference,
    employmentGroup: reference,
    holidayCalendar: reference,
    booking: empty,
    absence: empty,
    shiftAssignment: empty,
    onCallRotation: empty,
    timeAccount: {
      findFirst: vi.fn(async ({ where }) =>
        crossing && where.periodStart.lt === boundary ? { id } : null,
      ),
    },
    employmentTerm: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id, organizationUnitId: id, effectiveFrom: null, effectiveTo: null },
        ]),
      update: vi.fn(),
      create: vi.fn().mockResolvedValue({
        ...payload,
        id,
        assignmentId: id,
        effectiveFrom: boundary,
        weeklyHours: { toNumber: () => 20 },
        dailyTargetHours: { toNumber: () => 4 },
      }),
    },
  };
  const service = new EmploymentManagementService(
    { $transaction: async (run: (client: typeof tx) => Promise<unknown>) => run(tx) } as never,
    { assert: vi.fn() } as never,
    { appendAudit: vi.fn() } as never,
    { assertClosingPeriodsUnlockedForRangesInTransaction: vi.fn() } as never,
  );
  return { service, tx };
}
describe('term changes after explicit account splitting', () => {
  it('checks crossing accounts and permits a full partition at the new boundary', async () => {
    const f = fixture(false);
    await f.service.appendTerm(id, id, payload);
    expect(f.tx.timeAccount.findFirst).toHaveBeenCalledWith({
      where: { assignmentId: id, periodStart: { lt: boundary }, periodEnd: { gt: boundary } },
      select: { id: true },
    });
    expect(f.tx.employmentTerm.create).toHaveBeenCalledOnce();
  });
  it('refuses an unsplit account without changing the historical term', async () => {
    const f = fixture(true);
    f.tx.timeAccount.findFirst.mockResolvedValueOnce({ id });
    await expect(f.service.appendTerm(id, id, payload)).rejects.toThrow('Split or reconcile');
    expect(f.tx.employmentTerm.update).not.toHaveBeenCalled();
  });
});
