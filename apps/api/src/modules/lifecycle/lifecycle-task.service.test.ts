import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { LifecycleTaskService } from './lifecycle-task.service.js';

const ids = {
  actor: 'c00000000000000000000001',
  task: 'c00000000000000000000002',
};

function setup(status: 'OPEN' | 'DONE', dependentCount = 0) {
  const current = {
    id: ids.task,
    instanceId: 'instance-1',
    key: 'contract',
    title: 'Contract',
    description: '',
    responsiblePersonId: ids.actor,
    responsibleGroupId: null,
    dependsOn: ['identity'],
    blocking: true,
    dueDate: new Date('2026-01-01T00:00:00.000Z'),
    status,
    completedAt: status === 'DONE' ? new Date('2026-01-01T12:00:00.000Z') : null,
    completedById: status === 'DONE' ? ids.actor : null,
    createdAt: new Date('2025-12-01T00:00:00.000Z'),
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: ids.task }]),
    lifecycleTask: {
      findUnique: vi.fn().mockResolvedValue(current),
      count: vi.fn().mockResolvedValue(dependentCount),
      update: vi.fn(),
    },
    lifecycleTaskHistory: { create: vi.fn() },
    lifecycleInstance: { update: vi.fn().mockResolvedValue({}) },
  };
  const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
  const audit = { appendAudit: vi.fn() };
  return { service: new LifecycleTaskService(prisma as never, audit as never), tx, audit };
}

describe('LifecycleTaskService transitions', () => {
  it('keeps repeated completion idempotent without duplicate history or audit', async () => {
    const { service, tx, audit } = setup('DONE');

    await expect(
      service.complete(ids.actor, ids.task, { status: 'DONE', reason: 'Already complete' }),
    ).resolves.toMatchObject({ status: 'DONE', dueDate: '2026-01-01' });
    expect(tx.lifecycleTask.update).not.toHaveBeenCalled();
    expect(tx.lifecycleTaskHistory.create).not.toHaveBeenCalled();
    expect(audit.appendAudit).not.toHaveBeenCalled();
  });

  it('rejects reopening while a completed dependent exists', async () => {
    const { service, tx } = setup('DONE', 1);

    await expect(
      service.complete(ids.actor, ids.task, { status: 'OPEN', reason: 'Needs correction' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.lifecycleTask.update).not.toHaveBeenCalled();
  });

  it('rejects completion while a dependency remains open', async () => {
    const { service, tx } = setup('OPEN', 1);

    await expect(
      service.complete(ids.actor, ids.task, { status: 'DONE', reason: 'Attempted completion' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.lifecycleTask.update).not.toHaveBeenCalled();
  });
});
