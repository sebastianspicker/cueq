import { describe, expect, it } from 'vitest';
import { buildAuditEntry } from '..';

describe('audit trail integrity', () => {
  describe('array fields in before/after are frozen', () => {
    it('freezes arrays inside before payload', () => {
      const entry = buildAuditEntry({
        actorId: 'system',
        action: 'WORKFLOW_ESCALATED',
        entityType: 'WorkflowInstance',
        entityId: 'wf-1',
        before: { chain: ['TEAM_LEAD', 'HR'] },
      });

      expect(Object.isFrozen((entry.before as Record<string, unknown>).chain)).toBe(true);
      expect(() => {
        ((entry.before as Record<string, unknown>).chain as string[]).push('ADMIN');
      }).toThrow();
    });

    it('freezes arrays inside after payload', () => {
      const entry = buildAuditEntry({
        actorId: 'system',
        action: 'WORKFLOW_ESCALATED',
        entityType: 'WorkflowInstance',
        entityId: 'wf-1',
        after: { escalationRoles: ['HR', 'ADMIN'] },
      });

      expect(Object.isFrozen((entry.after as Record<string, unknown>).escalationRoles)).toBe(true);
    });

    it('freezes arrays inside metadata', () => {
      const entry = buildAuditEntry({
        actorId: 'admin-1',
        action: 'ROSTER_PUBLISHED',
        entityType: 'Roster',
        entityId: 'roster-1',
        metadata: { affectedShiftIds: ['shift-a', 'shift-b'] },
      });

      expect(
        Object.isFrozen((entry.metadata as Record<string, unknown>).affectedShiftIds),
      ).toBe(true);
    });
  });

  describe('deep reference isolation', () => {
    it('freezing does not affect the original input objects', () => {
      const before = { status: 'REQUESTED' as string };
      const after = { status: 'APPROVED' as string };

      buildAuditEntry({
        actorId: 'hr-1',
        action: 'LEAVE_APPROVED',
        entityType: 'Absence',
        entityId: 'abs-1',
        before,
        after,
      });

      // The original objects passed in should not be frozen by the builder
      expect(Object.isFrozen(before)).toBe(false);
      before.status = 'still mutable';
      expect(before.status).toBe('still mutable');
    });

    it('two entries built from the same input do not share mutable references', () => {
      const sharedPayload = { hours: 8 };

      const entry1 = buildAuditEntry({
        actorId: 'user-1',
        action: 'BOOKING_CREATED',
        entityType: 'Booking',
        entityId: 'b-1',
        after: sharedPayload,
      });

      const entry2 = buildAuditEntry({
        actorId: 'user-1',
        action: 'BOOKING_CREATED',
        entityType: 'Booking',
        entityId: 'b-2',
        after: sharedPayload,
      });

      expect(entry1.entityId).toBe('b-1');
      expect(entry2.entityId).toBe('b-2');
      // Both entries are independently frozen
      expect(Object.isFrozen(entry1)).toBe(true);
      expect(Object.isFrozen(entry2)).toBe(true);
    });
  });

  describe('unique identity per entry', () => {
    it('generates distinct IDs for concurrent entries', () => {
      const ids = Array.from({ length: 20 }, () =>
        buildAuditEntry({
          actorId: 'batch-actor',
          action: 'BOOKING_CREATED',
          entityType: 'Booking',
          entityId: 'b-1',
        }),
      ).map((e) => e.id);

      const unique = new Set(ids);
      expect(unique.size).toBe(20);
    });

    it('generates ISO 8601 timestamps', () => {
      const entry = buildAuditEntry({
        actorId: 'user-1',
        action: 'BOOKING_CREATED',
        entityType: 'Booking',
        entityId: 'b-1',
      });

      expect(() => new Date(entry.timestamp)).not.toThrow();
      expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
    });
  });

  describe('leave-request lifecycle audit trail', () => {
    const workflowId = 'wf-leave-42';
    const absenceId = 'abs-42';
    const employeeId = 'emp-1';
    const teamLeadId = 'tl-1';
    const hrId = 'hr-1';

    it('builds a complete leave lifecycle trail with correct actor-to-action mapping', () => {
      const trail = [
        buildAuditEntry({
          actorId: employeeId,
          action: 'LEAVE_REQUESTED',
          entityType: 'Absence',
          entityId: absenceId,
          after: { type: 'ANNUAL_LEAVE', days: 5, status: 'REQUESTED' },
        }),
        buildAuditEntry({
          actorId: teamLeadId,
          action: 'LEAVE_APPROVED',
          entityType: 'Absence',
          entityId: absenceId,
          before: { status: 'REQUESTED' },
          after: { status: 'APPROVED' },
          reason: 'Leave balance sufficient',
        }),
        buildAuditEntry({
          actorId: 'system',
          action: 'WORKFLOW_COMPLETED',
          entityType: 'WorkflowInstance',
          entityId: workflowId,
          before: { status: 'PENDING' },
          after: { status: 'APPROVED' },
        }),
      ];

      // Every entry is independent and immutable
      trail.forEach((entry) => expect(Object.isFrozen(entry)).toBe(true));

      const [step0, step1, step2] = trail;

      // Correct actors
      expect(step0!.actorId).toBe(employeeId);
      expect(step1!.actorId).toBe(teamLeadId);
      expect(step2!.actorId).toBe('system');

      // Actions follow the logical sequence
      expect(step0!.action).toBe('LEAVE_REQUESTED');
      expect(step1!.action).toBe('LEAVE_APPROVED');
      expect(step2!.action).toBe('WORKFLOW_COMPLETED');

      // All entries track the correct entity
      expect(step0!.entityId).toBe(absenceId);
      expect(step1!.entityId).toBe(absenceId);
      expect(step2!.entityId).toBe(workflowId);

      // All IDs are unique
      const ids = new Set(trail.map((e) => e.id));
      expect(ids.size).toBe(trail.length);
    });

    it('builds a rejection trail with reason captured', () => {
      const trail = [
        buildAuditEntry({
          actorId: employeeId,
          action: 'LEAVE_REQUESTED',
          entityType: 'Absence',
          entityId: absenceId,
          after: { type: 'ANNUAL_LEAVE', days: 15, status: 'REQUESTED' },
        }),
        buildAuditEntry({
          actorId: teamLeadId,
          action: 'LEAVE_REJECTED',
          entityType: 'Absence',
          entityId: absenceId,
          before: { status: 'REQUESTED' },
          after: { status: 'REJECTED' },
          reason: 'Insufficient leave balance',
        }),
      ];

      expect(trail[1]!.reason).toBe('Insufficient leave balance');
      expect((trail[1]!.after as Record<string, unknown>).status).toBe('REJECTED');
    });

    it('builds a delegation trail capturing escalation steps', () => {
      const trail = [
        buildAuditEntry({
          actorId: teamLeadId,
          action: 'WORKFLOW_DELEGATED',
          entityType: 'WorkflowInstance',
          entityId: workflowId,
          before: { assignee: teamLeadId },
          after: { assignee: hrId, delegationDepth: 1 },
          reason: 'On leave',
        }),
        buildAuditEntry({
          actorId: hrId,
          action: 'LEAVE_APPROVED',
          entityType: 'Absence',
          entityId: absenceId,
          before: { status: 'PENDING' },
          after: { status: 'APPROVED' },
          metadata: { delegationDepth: 1, originalApproverId: teamLeadId },
        }),
      ];

      const [delegation, approval] = trail;
      expect((delegation!.after as Record<string, unknown>).delegationDepth).toBe(1);
      expect((approval!.metadata as Record<string, unknown>).originalApproverId).toBe(teamLeadId);
    });
  });

  describe('closing lifecycle audit trail', () => {
    it('captures the full closing export lifecycle', () => {
      const periodId = 'period-2026-03';

      const trail = [
        buildAuditEntry({
          actorId: 'system',
          action: 'CLOSING_PERIOD_OPENED',
          entityType: 'ClosingPeriod',
          entityId: periodId,
          after: { status: 'OPEN', periodStart: '2026-03-01' },
        }),
        buildAuditEntry({
          actorId: 'tl-1',
          action: 'CLOSING_REVIEW_STARTED',
          entityType: 'ClosingPeriod',
          entityId: periodId,
          before: { status: 'OPEN' },
          after: { status: 'REVIEW' },
        }),
        buildAuditEntry({
          actorId: 'hr-1',
          action: 'CLOSING_APPROVED',
          entityType: 'ClosingPeriod',
          entityId: periodId,
          before: { status: 'REVIEW' },
          after: { status: 'CLOSED' },
        }),
        buildAuditEntry({
          actorId: 'payroll-1',
          action: 'CLOSING_EXPORTED',
          entityType: 'ClosingPeriod',
          entityId: periodId,
          before: { status: 'CLOSED' },
          after: { status: 'EXPORTED', checksum: 'sha256-abc123' },
          metadata: { format: 'CSV_V1', recordCount: 42 },
        }),
      ];

      // All entries frozen
      trail.forEach((e) => expect(Object.isFrozen(e)).toBe(true));

      // Checksum captured
      expect((trail[3]!.after as Record<string, unknown>).checksum).toBe('sha256-abc123');

      // Metadata captured
      expect((trail[3]!.metadata as Record<string, unknown>).format).toBe('CSV_V1');

      // All reference the same entity
      const entityIds = new Set(trail.map((e) => e.entityId));
      expect(entityIds.size).toBe(1);
      expect([...entityIds][0]!).toBe(periodId);
    });

    it('post-close correction trail preserves before/after export states', () => {
      const trail = [
        buildAuditEntry({
          actorId: 'hr-1',
          action: 'POST_CLOSE_CORRECTION_APPLIED',
          entityType: 'ClosingPeriod',
          entityId: 'period-2026-02',
          before: { status: 'EXPORTED' },
          after: { status: 'REVIEW' },
          reason: 'Sick-leave certificate arrived late',
          metadata: { correctionBookingId: 'bk-9000' },
        }),
        buildAuditEntry({
          actorId: 'payroll-1',
          action: 'CLOSING_EXPORTED',
          entityType: 'ClosingPeriod',
          entityId: 'period-2026-02',
          before: { status: 'CLOSED' },
          after: { status: 'EXPORTED', checksum: 'sha256-xyz789' },
          metadata: { format: 'CSV_V1', isReExport: true },
        }),
      ];

      expect(trail[0]!.reason).toBe('Sick-leave certificate arrived late');
      expect((trail[0]!.before as Record<string, unknown>).status).toBe('EXPORTED');
      expect((trail[1]!.metadata as Record<string, unknown>).isReExport).toBe(true);
    });
  });

  describe('required fields are always present', () => {
    it('every entry has id, timestamp, actorId, action, entityType, entityId', () => {
      const required = ['id', 'timestamp', 'actorId', 'action', 'entityType', 'entityId'] as const;

      const entry = buildAuditEntry({
        actorId: 'user-1',
        action: 'BOOKING_CREATED',
        entityType: 'Booking',
        entityId: 'b-1',
      });

      for (const field of required) {
        expect(entry[field], `field '${field}' should be present`).toBeDefined();
        expect(entry[field], `field '${field}' should not be empty string`).not.toBe('');
      }
    });

    it('optional fields default correctly: reason is null, before/after/metadata are undefined', () => {
      const entry = buildAuditEntry({
        actorId: 'user-1',
        action: 'BOOKING_CREATED',
        entityType: 'Booking',
        entityId: 'b-1',
      });

      expect(entry.reason).toBeNull();
      expect(entry.before).toBeUndefined();
      expect(entry.after).toBeUndefined();
      expect(entry.metadata).toBeUndefined();
    });
  });
});
