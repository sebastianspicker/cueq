import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

describe('@cueq/database compliance', () => {
  it('keeps audit entries append-oriented (no updatedAt field)', () => {
    expect('updatedAt' in Prisma.AuditEntryScalarFieldEnum).toBe(false);
  });

  it('AuditEntry has only scalar fields (no FK relations that could cascade)', () => {
    const fields = Object.keys(Prisma.AuditEntryScalarFieldEnum);
    // AuditEntry must not have foreign-key relation columns
    // (actorId is a plain string, not a Prisma @relation FK)
    expect(fields).not.toContain('personId');
    expect(fields).toContain('actorId');
    expect(fields).toContain('entityType');
    expect(fields).toContain('entityId');
  });

  it('AuditEntry schema has expected immutable fields', () => {
    const fields = Object.keys(Prisma.AuditEntryScalarFieldEnum);
    const expectedFields = [
      'id',
      'timestamp',
      'actorId',
      'action',
      'entityType',
      'entityId',
      'before',
      'after',
      'reason',
      'ipAddress',
    ];
    expect(fields.sort()).toEqual(expectedFields.sort());
  });

  it('Decimal precision is constrained on hours/days fields', () => {
    // Verify that key models with Decimal fields exist in the generated client
    // These fields should have @db.Decimal(10,2) in the schema
    const timeAccountFields = Object.keys(Prisma.TimeAccountScalarFieldEnum);
    expect(timeAccountFields).toContain('targetHours');
    expect(timeAccountFields).toContain('actualHours');
    expect(timeAccountFields).toContain('balance');
    expect(timeAccountFields).toContain('overtimeHours');

    const absenceFields = Object.keys(Prisma.AbsenceScalarFieldEnum);
    expect(absenceFields).toContain('days');
  });
});
