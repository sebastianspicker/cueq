import { describe, expect, it, vi } from 'vitest';
import { LeaveBalanceHelper } from '../leave-balance.helper.js';

const user = { sub: 'user-1', email: 'person@example.test' };

function absence(startDate: string, endDate: string, days: number) {
  return {
    startDate: new Date(`${startDate}T00:00:00.000Z`),
    endDate: new Date(`${endDate}T00:00:00.000Z`),
    days,
  };
}

function createHelper(input: {
  annualLeaveAbsences: ReturnType<typeof absence>[];
  priorAnnualLeaveAbsences?: ReturnType<typeof absence>[];
  holidayDates?: string[];
}) {
  const prisma = {
    workTimeModel: { findUnique: vi.fn() },
    absence: {
      findMany: vi
        .fn()
        .mockResolvedValueOnce(input.annualLeaveAbsences)
        .mockResolvedValueOnce(input.priorAnnualLeaveAbsences ?? []),
    },
    leaveAdjustment: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const personHelper = {
    personForUser: vi.fn().mockResolvedValue({
      id: 'person-1',
      workTimeModelId: null,
      employmentStartDate: null,
      employmentEndDate: null,
    }),
  };
  const holidayProvider = {
    holidayDatesBetween: vi.fn().mockReturnValue(input.holidayDates ?? []),
  };

  return new LeaveBalanceHelper(prisma as never, personHelper as never, holidayProvider as never);
}

describe('LeaveBalanceHelper', () => {
  it('allocates a cross-year absence to working days in the requested year only', async () => {
    const helper = createHelper({
      annualLeaveAbsences: [absence('2025-12-30', '2026-01-05', 4)],
      priorAnnualLeaveAbsences: [absence('2025-12-30', '2026-01-05', 4)],
      holidayDates: ['2026-01-01'],
    });

    const balance = await helper.leaveBalance(user as never, 2026, '2026-12-31');

    expect(balance.used).toBe(2);
    expect(balance.carriedOver).toBe(28);
  });

  it('counts only working days through asOfDate for an absence still in progress', async () => {
    const helper = createHelper({
      annualLeaveAbsences: [absence('2026-06-01', '2026-06-05', 5)],
    });

    const balance = await helper.leaveBalance(user as never, 2026, '2026-06-03');

    expect(balance.used).toBe(3);
  });
});
