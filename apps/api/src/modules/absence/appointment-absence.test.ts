import { AbsenceStatus } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { writeAbsenceCreation } from './absence-create.writer.js';

const personId = 'c000000000000000000000001';
const assignmentId = 'c000000000000000000000002';
const otherAssignmentId = 'c000000000000000000000003';
function fixture(existingAssignmentId: string) {
  const start = new Date('2026-09-07T00:00:00Z');
  const end = new Date('2026-09-08T00:00:00Z');
  const resolved = {
    assignment: { id: assignmentId },
    organizationUnitId: 'unit',
    supervisorId: null,
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
    absence: {
      findFirst: vi.fn(async ({ where }) =>
        !where.assignmentId || where.assignmentId === existingAssignmentId
          ? { id: 'existing' }
          : null,
      ),
      create: vi.fn(async ({ data }) => ({ id: 'new', ...data })),
    },
  };
  const run = () =>
    writeAbsenceCreation(tx as never, {
      actorId: personId,
      parsed: {
        personId,
        assignmentId,
        type: 'SICK',
        startDate: '2026-09-07',
        endDate: '2026-09-08',
      },
      resolved: resolved as never,
      start,
      end,
      endExclusive: new Date('2026-09-09T00:00:00Z'),
      daySpan: 2,
      status: AbsenceStatus.APPROVED,
      requiresApproval: false,
      assignmentHelper: { assertUnchanged: vi.fn().mockResolvedValue(resolved) },
      assertClosingUnlocked: vi.fn(),
      workflowRuntimeService: { buildWorkflowAssignment: vi.fn() },
      auditHelper: { appendAudit: vi.fn() },
    });
  return { tx, run };
}
describe('concurrent appointment absences', () => {
  it('records the same absence dates independently for a second appointment', async () => {
    const f = fixture(otherAssignmentId);
    await expect(f.run()).resolves.toMatchObject({ personId, assignmentId });
    expect(f.tx.absence.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ personId, assignmentId }) }),
    );
  });
  it('still rejects overlapping absence dates in the same appointment', async () => {
    const f = fixture(assignmentId);
    await expect(f.run()).rejects.toThrow('Absence overlaps');
    expect(f.tx.absence.create).not.toHaveBeenCalled();
  });
});
