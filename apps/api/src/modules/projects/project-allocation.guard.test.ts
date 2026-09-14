import { TimeTypeCategory } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { assertProjectAllocationsFit } from './project-allocation.guard.js';

describe('project allocation booking correction guard', () => {
  it('does not read booking details when no project minutes are allocated', async () => {
    const booking = { findUnique: vi.fn() };
    const tx = {
      projectTimeAllocation: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { minutes: null } }),
      },
      booking,
      timeType: { findUnique: vi.fn() },
    };

    await expect(
      assertProjectAllocationsFit(
        tx as never,
        'booking-1',
        new Date('2026-01-01T08:00:00.000Z'),
        null,
      ),
    ).resolves.toBeUndefined();
    expect(booking.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a corrected range shorter than existing allocations', async () => {
    const tx = {
      projectTimeAllocation: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { minutes: 61 } }),
      },
      booking: {
        findUnique: vi.fn().mockResolvedValue({
          startTime: new Date('2026-01-01T08:00:00.000Z'),
          endTime: new Date('2026-01-01T09:00:00.000Z'),
          timeTypeId: 'work-type',
          timeType: { category: TimeTypeCategory.WORK },
        }),
      },
      timeType: { findUnique: vi.fn() },
    };

    await expect(
      assertProjectAllocationsFit(
        tx as never,
        'booking-1',
        new Date('2026-01-01T08:00:00.000Z'),
        new Date('2026-01-01T09:00:00.000Z'),
      ),
    ).rejects.toThrow('invalidate existing project time allocations');
  });

  it('rejects timestamp and allocatable-category changes while allocations exist', async () => {
    const tx = {
      projectTimeAllocation: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { minutes: 30 } }),
      },
      booking: {
        findUnique: vi.fn().mockResolvedValue({
          startTime: new Date('2026-01-01T08:00:00.000Z'),
          endTime: new Date('2026-01-01T09:00:00.000Z'),
          timeTypeId: 'work-type',
          timeType: { category: TimeTypeCategory.WORK },
        }),
      },
      timeType: {
        findUnique: vi.fn().mockResolvedValue({ category: TimeTypeCategory.PAUSE }),
      },
    };

    await expect(
      assertProjectAllocationsFit(
        tx as never,
        'booking-1',
        new Date('2026-01-01T08:01:00.000Z'),
        new Date('2026-01-01T09:00:00.000Z'),
      ),
    ).rejects.toThrow('Reconcile project time allocations');
    await expect(
      assertProjectAllocationsFit(
        tx as never,
        'booking-1',
        new Date('2026-01-01T08:00:00.000Z'),
        new Date('2026-01-01T09:00:00.000Z'),
        'pause-type',
      ),
    ).rejects.toThrow('invalidate existing project time allocations');
  });
});
