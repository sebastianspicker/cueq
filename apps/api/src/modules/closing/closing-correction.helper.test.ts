import {
  BookingSource,
  ClosingStatus,
  Role,
  TimeTypeCategory,
  WorkflowStatus,
  WorkflowType,
} from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from '../audit/public.js';
import type { AssignmentHelper, PersonHelper } from '../people/public.js';
import type { WorkflowRuntimePort } from '../../application/ports/workflow-runtime.port.js';
import { ClosingCorrectionHelper } from './closing-correction.helper.js';

describe('post-close appointment correction', () => {
  it('increments only the selected appointment account and audits the assignment', async () => {
    const workflowId = 'c00000000000000000000001';
    const personId = 'c00000000000000000000002';
    const assignmentId = 'c00000000000000000000003';
    const timeTypeId = 'c00000000000000000000004';
    const update = vi.fn(async () => undefined);
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'booking-1',
      ...data,
      source: BookingSource.CORRECTION,
      note: data.note as string,
    }));
    const appendAudit = vi.fn(async () => undefined);
    const tx = {
      $queryRaw: vi.fn(async () => [{ acquired: true }]),
      closingPeriod: {
        findUnique: vi.fn(async () => ({
          id: 'period-1',
          status: ClosingStatus.REVIEW,
          organizationUnitId: 'ou-1',
          periodStart: new Date('2026-03-01T00:00:00.000Z'),
          periodEnd: new Date('2026-03-31T23:59:59.000Z'),
        })),
      },
      workflowInstance: {
        findUnique: vi.fn(async () => ({
          id: workflowId,
          type: WorkflowType.POST_CLOSE_CORRECTION,
          status: WorkflowStatus.APPROVED,
          entityType: 'ClosingPeriod',
          entityId: 'period-1',
        })),
      },
      timeType: {
        findUnique: vi.fn(async () => ({ code: 'WORK', category: TimeTypeCategory.WORK })),
      },
      booking: { findFirst: vi.fn(async () => null), create },
      timeAccount: {
        findMany: vi.fn(async () => [{ id: 'account-a' }]),
        update,
      },
    };
    const prisma = {
      $transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx),
    } as unknown as PrismaService;
    const helper = new ClosingCorrectionHelper(
      prisma,
      {
        personForUser: async () => ({ id: 'actor-1', organizationUnitId: 'ou-actor' }),
      } as unknown as PersonHelper,
      {
        resolveInterval: async () => ({
          assignment: { id: assignmentId },
          organizationUnitId: 'ou-1',
        }),
      } as unknown as AssignmentHelper,
      { appendAudit } as unknown as AuditHelper,
      {} as WorkflowRuntimePort,
    );

    const result = await helper.applyPostCloseBookingCorrection(
      { subject: 'actor', email: 'actor@example.test', role: Role.HR, claims: {} },
      'period-1',
      {
        workflowId,
        personId,
        assignmentId,
        timeTypeId,
        startTime: '2026-03-10T08:00:00.000Z',
        endTime: '2026-03-10T10:00:00.000Z',
        reason: 'Approved correction reason',
      },
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ personId, assignmentId }),
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'account-a' },
      data: { actualHours: { increment: 2 }, balance: { increment: 2 } },
    });
    expect(appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({ assignmentId }),
      }),
      tx,
    );
    expect(result).toMatchObject({ assignmentId, durationHours: 2 });
  });
});
