import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProjectManagementService } from './project-management.service.js';

const ids = {
  actor: 'c00000000000000000000001',
  person: 'c00000000000000000000002',
  assignment: 'c00000000000000000000003',
  project: 'c00000000000000000000004',
};

function setup(employmentEndDate: Date | null) {
  const membership = {
    id: 'membership-1',
    projectId: ids.project,
    personId: ids.person,
    assignmentId: ids.assignment,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: new Date('2026-02-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: true, id: ids.project }]),
    project: { findUnique: vi.fn().mockResolvedValue({ id: ids.project, archivedAt: null }) },
    projectMembership: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(membership),
    },
  };
  const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
  const assignments = {
    selectAssignment: vi.fn().mockResolvedValue({
      id: ids.assignment,
      personId: ids.person,
      employmentStartDate: new Date('2026-01-01T00:00:00.000Z'),
      employmentEndDate,
    }),
  };
  const audit = { appendAudit: vi.fn().mockResolvedValue(undefined) };
  return {
    service: new ProjectManagementService(
      prisma as never,
      { assert: vi.fn() } as never,
      assignments as never,
      audit as never,
    ),
    tx,
    audit,
  };
}

describe('project appointment membership', () => {
  it('accepts a membership ending at the inclusive appointment end boundary', async () => {
    const { service, tx, audit } = setup(new Date('2026-01-31T00:00:00.000Z'));

    await expect(
      service.addMember(ids.actor, ids.project, {
        personId: ids.person,
        assignmentId: ids.assignment,
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveTo: '2026-02-01T00:00:00.000Z',
      }),
    ).resolves.toMatchObject({ assignmentId: ids.assignment });
    expect(tx.projectMembership.create).toHaveBeenCalled();
    expect(audit.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PROJECT_MEMBERSHIP_CREATED' }),
      tx,
    );
  });

  it('rejects an open membership for a finite appointment', async () => {
    const { service, tx } = setup(new Date('2026-01-31T00:00:00.000Z'));

    await expect(
      service.addMember(ids.actor, ids.project, {
        personId: ids.person,
        assignmentId: ids.assignment,
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveTo: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.projectMembership.create).not.toHaveBeenCalled();
  });
});
