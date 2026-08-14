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
  adjustments?: Array<{ year: number; deltaDays: unknown }>;
  workTimeModelId?: string | null;
  onQueryStart?: (query: string) => void;
}) {
  const prisma = {
    workTimeModel: {
      findUnique: vi.fn().mockImplementation(() => {
        input.onQueryStart?.('workTimeModel');
        return Promise.resolve(null);
      }),
    },
    absence: {
      findMany: vi
        .fn()
        .mockImplementationOnce(() => {
          input.onQueryStart?.('annualLeaveAbsences');
          return Promise.resolve(input.annualLeaveAbsences);
        })
        .mockImplementationOnce(() => {
          input.onQueryStart?.('priorAnnualLeaveAbsences');
          return Promise.resolve(input.priorAnnualLeaveAbsences ?? []);
        }),
    },
    leaveAdjustment: {
      findMany: vi.fn().mockImplementation(() => {
        input.onQueryStart?.('adjustments');
        return Promise.resolve(input.adjustments ?? []);
      }),
    },
  };
  const personHelper = {
    personForUser: vi.fn().mockResolvedValue({
      id: 'person-1',
      workTimeModelId: input.workTimeModelId ?? null,
      employmentStartDate: null,
      employmentEndDate: null,
    }),
  };
  const holidayProvider = {
    holidayDatesBetween: vi.fn().mockReturnValue(input.holidayDates ?? []),
  };

  return {
    helper: new LeaveBalanceHelper(
      prisma as never,
      personHelper as never,
      holidayProvider as never,
    ),
    prisma,
  };
}

describe('LeaveBalanceHelper', () => {
  it('allocates a cross-year absence to working days in the requested year only', async () => {
    const { helper } = createHelper({
      annualLeaveAbsences: [absence('2025-12-30', '2026-01-05', 4)],
      priorAnnualLeaveAbsences: [absence('2025-12-30', '2026-01-05', 4)],
      holidayDates: ['2026-01-01'],
    });

    const balance = await helper.leaveBalance(user as never, 2026, '2026-12-31');

    expect(balance.used).toBe(2);
    expect(balance.carriedOver).toBe(28);
  });

  it('counts only working days through asOfDate for an absence still in progress', async () => {
    const { helper } = createHelper({
      annualLeaveAbsences: [absence('2026-06-01', '2026-06-05', 5)],
    });

    const balance = await helper.leaveBalance(user as never, 2026, '2026-06-03');

    expect(balance.used).toBe(3);
  });

  it('keeps annual and prior-period allocation while converting adjustments to days', async () => {
    const { helper } = createHelper({
      annualLeaveAbsences: [absence('2026-01-02', '2026-01-02', 1)],
      priorAnnualLeaveAbsences: [absence('2025-12-31', '2025-12-31', 1)],
      adjustments: [
        { year: 2025, deltaDays: { toString: () => '1.5' } },
        { year: 2026, deltaDays: { toString: () => '2.5' } },
      ],
    });

    const balance = await helper.leaveBalance(user as never, 2026, '2026-12-31');

    expect(balance.used).toBe(1);
    expect(balance.carriedOver).toBe(30);
    expect(balance.adjustments).toBe(2.5);
  });

  it('rejects invalid asOfDate without starting period queries', async () => {
    const { helper, prisma } = createHelper({ annualLeaveAbsences: [] });

    await expect(helper.leaveBalance(user as never, 2026, 'not-a-date')).rejects.toThrow(
      'Invalid asOfDate.',
    );

    expect(prisma.workTimeModel.findUnique).not.toHaveBeenCalled();
    expect(prisma.absence.findMany).not.toHaveBeenCalled();
    expect(prisma.leaveAdjustment.findMany).not.toHaveBeenCalled();
  });

  it('starts the work-time model lookup with the independent period queries', async () => {
    const queryStarts: string[] = [];
    const { helper, prisma } = createHelper({
      annualLeaveAbsences: [],
      workTimeModelId: 'model-1',
      onQueryStart: (query) => queryStarts.push(query),
    });

    await helper.leaveBalance(user as never, 2026, '2026-12-31');

    expect(queryStarts).toEqual([
      'workTimeModel',
      'annualLeaveAbsences',
      'priorAnnualLeaveAbsences',
      'adjustments',
    ]);
    expect(prisma.workTimeModel.findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'model-1' },
    });
  });
});
