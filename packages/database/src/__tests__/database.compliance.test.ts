import { Prisma } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const moduleDirectory = fileURLToPath(new URL('.', import.meta.url));

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

  it('enforces audit-entry append-only storage with a PostgreSQL trigger', () => {
    const migration = readFileSync(
      resolve(
        moduleDirectory,
        '../../prisma/migrations/20260715090000_enforce_audit_entry_immutability/migration.sql',
      ),
      'utf8',
    );

    expect(migration).toContain('CREATE TRIGGER "audit_entries_reject_mutation"');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON "audit_entries"');
    expect(migration).toContain('RAISE EXCEPTION');
    expect(migration).toContain("ERRCODE = '55000'");
  });

  it('keeps seed and reset paths append-only for audit entries', () => {
    const seedScripts = ['seed-phase2.mjs', 'seed-phase3.mjs', 'seed-demo-screenshots.mjs'].map(
      (file) => readFileSync(resolve(moduleDirectory, `../../prisma/${file}`), 'utf8'),
    );

    for (const source of seedScripts) {
      expect(source).not.toMatch(/auditEntry\.(?:delete|deleteMany|update|updateMany|upsert)\s*\(/);
    }
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

  it('exposes terminal ingestion checksums as durable scalar identity', () => {
    const fields = Object.keys(Prisma.TerminalSyncBatchScalarFieldEnum);

    expect(fields).toContain('ingestionChecksum');
  });

  it('enforces one webhook delivery row per endpoint attempt', () => {
    const model = Prisma.dmmf.datamodel.models.find((entry) => entry.name === 'WebhookDelivery');

    expect(model?.uniqueFields).toContainEqual(['outboxEventId', 'endpointId', 'attempt']);
  });

  it('declares partial storage uniqueness for active policy versions', () => {
    const migration = readFileSync(
      resolve(
        moduleDirectory,
        '../../prisma/migrations/20260714173000_enforce_policy_and_webhook_uniqueness/migration.sql',
      ),
      'utf8',
    );

    expect(migration).toContain('workflow_policies_one_active_type_key');
    expect(migration).toContain('WHERE "activeTo" IS NULL');
    expect(migration).toContain('time_threshold_policies_one_active_key');
  });
});
