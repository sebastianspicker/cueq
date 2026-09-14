import { ConflictException } from '@nestjs/common';
import { TimeTypeCategory } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { ProjectTimeService } from './project-time.service.js';

const ids = {
  actor: 'c00000000000000000000001',
  assignment: 'c00000000000000000000002',
  booking: 'c00000000000000000000003',
  project: 'c00000000000000000000004',
};

function setup(input?: { archived?: boolean; allocatedMinutes?: number; personId?: string }) {
  const booking = {
    id: ids.booking,
    personId: input?.personId ?? ids.actor,
    assignmentId: ids.assignment,
    startTime: new Date('2026-01-02T08:00:00.000Z'),
    endTime: new Date('2026-01-02T09:00:00.000Z'),
    timeType: { category: TimeTypeCategory.WORK },
  };
  const allocation = {
    id: 'allocation-1',
    projectId: ids.project,
    bookingId: ids.booking,
    assignmentId: ids.assignment,
    personId: ids.actor,
    minutes: 30,
    note: null,
    createdAt: new Date('2026-01-03T00:00:00.000Z'),
    updatedAt: new Date('2026-01-03T00:00:00.000Z'),
    project: { code: 'P1', name: 'Project 1' },
    booking: { startTime: booking.startTime, endTime: booking.endTime },
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: true, id: ids.project }]),
    project: {
      findUnique: vi.fn().mockResolvedValue({
        id: ids.project,
        archivedAt: input?.archived ? new Date('2026-01-04T00:00:00.000Z') : null,
      }),
    },
    booking: { findUnique: vi.fn().mockResolvedValue(booking), update: vi.fn() },
    projectMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'membership-1' }) },
    projectTimeAllocation: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(allocation),
      update: vi.fn().mockResolvedValue({ ...allocation, minutes: 0 }),
      aggregate: vi.fn().mockResolvedValue({
        _sum: { minutes: input?.allocatedMinutes ?? 0 },
      }),
      upsert: vi.fn().mockResolvedValue(allocation),
    },
  };
  const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
  const audit = { appendAudit: vi.fn().mockResolvedValue(undefined) };
  const service = new ProjectTimeService(
    prisma as never,
    { selectAssignment: vi.fn() } as never,
    { assert: vi.fn() } as never,
    audit as never,
  );
  return { service, tx, audit };
}

const payload = {
  projectId: ids.project,
  bookingId: ids.booking,
  assignmentId: ids.assignment,
  minutes: 30,
  note: null,
};

describe('project time allocation', () => {
  it('upserts a scoped allocation without mutating attendance credit', async () => {
    const { service, tx, audit } = setup();

    await expect(service.allocate(ids.actor, payload)).resolves.toMatchObject({
      projectId: ids.project,
      bookingId: ids.booking,
      assignmentId: ids.assignment,
      minutes: 30,
    });

    expect(tx.projectTimeAllocation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          personId: ids.actor,
          assignmentId: ids.assignment,
          minutes: 30,
        }),
      }),
    );
    expect(tx.booking.update).not.toHaveBeenCalled();
    expect(audit.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PROJECT_TIME_ALLOCATION_CREATED' }),
      tx,
    );
  });

  it('preserves the whole-booking allocation ceiling across projects', async () => {
    const { service, tx } = setup({ allocatedMinutes: 40 });

    await expect(service.allocate(ids.actor, payload)).rejects.toThrow(
      'Project allocations exceed the booking duration.',
    );
    expect(tx.projectTimeAllocation.upsert).not.toHaveBeenCalled();
  });

  it('rejects archived projects and cross-person bookings', async () => {
    const archived = setup({ archived: true });
    await expect(archived.service.allocate(ids.actor, payload)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(archived.tx.booking.findUnique).not.toHaveBeenCalled();

    const otherPerson = setup({ personId: 'c00000000000000000000005' });
    await expect(otherPerson.service.allocate(ids.actor, payload)).rejects.toThrow(
      'Booking is not available for personal allocation.',
    );
    expect(otherPerson.tx.projectTimeAllocation.upsert).not.toHaveBeenCalled();
  });
});

describe('project allocation release', () => {
  it('retains history and attendance when releasing effort from an archived project', async () => {
    const { service, tx, audit } = setup({ archived: true });
    const released = await service.release(ids.actor, 'allocation-1');
    expect(released).toMatchObject({ minutes: 0, bookingId: ids.booking });
    expect(tx.projectTimeAllocation.findFirst).toHaveBeenCalledWith({
      where: { id: 'allocation-1', personId: ids.actor },
    });
    expect(tx.projectTimeAllocation.update).toHaveBeenCalledWith({
      where: { id: 'allocation-1' },
      data: { minutes: 0 },
    });
    expect(tx.booking.update).not.toHaveBeenCalled();
    expect(audit.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PROJECT_ALLOCATION_RELEASED', before: { minutes: 30 } }),
      tx,
    );
    const stored = await tx.projectTimeAllocation.update.mock.results[0]?.value;
    tx.projectTimeAllocation.findFirst.mockResolvedValueOnce(stored);
    await service.release(ids.actor, 'allocation-1');
    expect(audit.appendAudit).toHaveBeenCalledTimes(1);
  });
  it('rejects unavailable personal allocations before project access or writes', async () => {
    const { service, tx } = setup();
    tx.projectTimeAllocation.findFirst.mockResolvedValueOnce(null);
    await expect(service.release(ids.actor, 'missing')).rejects.toThrow('Allocation not found');
    expect(tx.projectTimeAllocation.update).not.toHaveBeenCalled();
  });
});
