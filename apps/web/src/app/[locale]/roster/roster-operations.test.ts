import { afterAll, describe, expect, it, vi } from 'vitest';
import { RosterShiftDetailSchema } from '@cueq/shared';
import { createShift, type RosterOperationContext } from './roster-operations';

const originalTimeZone = process.env.TZ;

function context(overrides: Partial<RosterOperationContext> = {}): RosterOperationContext {
  return {
    apiRequest: vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ id: 'roster-1' })
      .mockResolvedValueOnce({}),
    t: vi.fn((key: string) => key) as never,
    roster: { id: 'roster-1', members: [] } as never,
    setRoster: vi.fn(),
    setPlanVsActual: vi.fn(),
    setMessage: vi.fn(),
    setError: vi.fn(),
    setLoading: vi.fn(),
    draftOrganizationUnitId: 'org-1',
    setDraftOrganizationUnitId: vi.fn(),
    draftPeriodStart: '2026-07-01T00:00',
    draftPeriodEnd: '2026-07-31T23:59',
    shiftStart: '2026-07-01T08:00',
    shiftEnd: '2026-07-01T16:00',
    shiftType: 'EARLY',
    minStaffing: 1,
    assignSelection: {},
    swapShiftId: '',
    swapFromPersonId: '',
    swapToPersonId: '',
    swapReason: '',
    ...overrides,
  };
}

afterAll(() => {
  process.env.TZ = originalTimeZone;
});

describe('roster datetime operations', () => {
  it('submits Berlin instants independently of the browser timezone', async () => {
    process.env.TZ = 'America/New_York';
    const operationContext = context();

    await createShift(operationContext);

    expect(operationContext.apiRequest).toHaveBeenNthCalledWith(
      1,
      '/v1/rosters/roster-1/shifts',
      RosterShiftDetailSchema,
      {
        method: 'POST',
        body: JSON.stringify({
          startTime: '2026-07-01T06:00:00.000Z',
          endTime: '2026-07-01T14:00:00.000Z',
          shiftType: 'EARLY',
          minStaffing: 1,
        }),
      },
    );
  });

  it('does not submit a nonexistent Berlin wall-clock time', async () => {
    const operationContext = context({ shiftStart: '2026-03-29T02:30' });

    await createShift(operationContext);

    expect(operationContext.apiRequest).not.toHaveBeenCalled();
    expect(operationContext.setError).toHaveBeenCalledWith('invalidDateTime');
  });
});
