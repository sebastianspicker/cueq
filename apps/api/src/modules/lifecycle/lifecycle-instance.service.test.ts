import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { LifecycleInstanceService } from './lifecycle-instance.service.js';

const ids = {
  actor: 'c00000000000000000000001',
  person: 'c00000000000000000000002',
  assignment: 'c00000000000000000000003',
  template: 'c00000000000000000000004',
};

describe('LifecycleInstanceService activation', () => {
  it('returns the original immutable task snapshot on an idempotent retry', async () => {
    const createdAt = new Date('2026-01-01T10:00:00.000Z');
    const task = {
      id: 'task-1',
      instanceId: 'instance-1',
      key: 'first',
      title: 'First',
      description: '',
      responsiblePersonId: ids.person,
      responsibleGroupId: null,
      dependsOn: [],
      blocking: true,
      dueDate: new Date('2026-01-01T00:00:00.000Z'),
      status: 'OPEN',
      completedAt: null,
      completedById: null,
      createdAt,
    };
    const existing = {
      id: 'instance-1',
      templateId: ids.template,
      assignmentId: ids.assignment,
      personId: ids.person,
      organizationUnitId: 'ou-1',
      eventKey: 'manual:onboarding',
      snapshot: {
        definition: {
          tasks: [
            {
              key: 'first',
              title: 'First',
              description: '',
              responsibleKind: 'SUBJECT',
              responsibleId: null,
              dueOffsetDays: 0,
              dependsOn: [],
              blocking: true,
            },
          ],
        },
      },
      baseDate: new Date('2026-01-01T00:00:00.000Z'),
      status: 'ACTIVE',
      createdAt,
      tasks: [task],
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      lifecycleAutomationRule: { findUnique: vi.fn() },
      lifecycleInstance: { findUnique: vi.fn().mockResolvedValue(existing), create: vi.fn() },
      lifecycleTemplate: { findUnique: vi.fn() },
      lifecycleTask: { create: vi.fn() },
    };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
    const assignments = {
      resolveInterval: vi.fn().mockResolvedValue({ organizationUnitId: 'ou-1' }),
    };
    const capabilities = { assert: vi.fn().mockResolvedValue(undefined) };
    const service = new LifecycleInstanceService(
      prisma as never,
      assignments as never,
      capabilities as never,
      { appendAudit: vi.fn() } as never,
      { append: vi.fn() } as never,
    );

    const result = await service.activate(ids.actor, {
      templateId: ids.template,
      personId: ids.person,
      assignmentId: ids.assignment,
      eventKey: 'manual:onboarding',
      baseDate: '2026-01-01',
    });

    expect(result).toMatchObject({
      id: 'instance-1',
      baseDate: '2026-01-01',
      tasks: [{ id: 'task-1', dueDate: '2026-01-01' }],
    });
    expect(tx.lifecycleTemplate.findUnique).not.toHaveBeenCalled();
    expect(tx.lifecycleTask.create).not.toHaveBeenCalled();
  });

  it('rejects an unauthorized appointment before resolving private terms', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
    const assignments = { resolveInterval: vi.fn() };
    const service = new LifecycleInstanceService(
      prisma as never,
      assignments as never,
      { assert: vi.fn() } as never,
      { appendAudit: vi.fn() } as never,
      { append: vi.fn() } as never,
    );

    await expect(
      service.activate(ids.actor, {
        templateId: ids.template,
        personId: ids.person,
        assignmentId: ids.assignment,
        eventKey: 'manual:unauthorized',
        baseDate: '2026-01-01',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(assignments.resolveInterval).not.toHaveBeenCalled();
  });
});
