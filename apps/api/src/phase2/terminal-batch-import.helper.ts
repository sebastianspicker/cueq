/** Transaction-scoped terminal batch ingestion workflow. */
import { BadRequestException } from '@nestjs/common';
import { BookingSource, type Prisma } from '@cueq/database';
import type { AuthenticatedIdentity } from '../common/auth/auth.types.js';
import type { PrismaService } from '../persistence/prisma.service.js';
import { bookingOverlapWhere } from './helpers/booking-overlap.helper.js';
import type { AuditHelper } from './helpers/audit.helper.js';
import type {
  ClosingBlockedAttemptInput,
  ClosingLockHelper,
} from './helpers/closing-lock.helper.js';
import {
  lockPersonWrites,
  lockTerminalIngestion,
  lockTerminalWrites,
} from './helpers/transaction-lock.helper.js';
import {
  TerminalImportResultPayloadSchema,
  TerminalSyncBatchSchema,
  type TerminalFileMetrics,
  type TerminalRecord,
  type TerminalSyncBatchInput,
} from './terminal-contracts.js';
import {
  createTerminalIngestionChecksum,
  normalizeTerminalRecords,
} from './terminal-import-normalization.js';

export type TerminalBatchImportDependencies = {
  prisma: PrismaService;
  auditHelper: AuditHelper;
  closingLockHelper: ClosingLockHelper;
};

type ClosingAttemptState = { current?: ClosingBlockedAttemptInput };
type BatchOutcomes = {
  created: number;
  duplicates: number;
  conflictFlags: Array<{
    personId: string;
    startTime: string;
    type: 'ABSENCE_CONFLICT' | 'BOOKING_OVERLAP';
  }>;
  unknownTimeTypes: Array<{
    personId: string;
    startTime: string;
    timeTypeCode: string;
  }>;
};

async function assertPeopleAndClosingPeriods(
  tx: Prisma.TransactionClient,
  parsed: TerminalSyncBatchInput,
  canonicalRecords: TerminalRecord[],
  actorId: string,
  ingestionChecksum: string,
  closingAttempt: ClosingAttemptState,
  closingLockHelper: ClosingLockHelper,
): Promise<string[]> {
  const personIds = [...new Set(canonicalRecords.map((record) => record.personId))];
  const people = await tx.person.findMany({
    where: { id: { in: personIds } },
    select: { id: true, organizationUnitId: true },
  });
  const peopleById = new Map(people.map((person) => [person.id, person]));

  for (const record of canonicalRecords) {
    const person = peopleById.get(record.personId);
    if (!person) {
      throw new BadRequestException(`Person not found for terminal record: ${record.personId}`);
    }

    const startTime = new Date(record.startTime);
    closingAttempt.current = {
      actorId,
      organizationUnitId: person.organizationUnitId,
      from: startTime,
      to: record.endTime ? new Date(record.endTime) : startTime,
      attemptedAction: 'TERMINAL_BATCH_IMPORT',
      entityType: 'TerminalSyncBatch',
      entityId: `${parsed.terminalId}:${ingestionChecksum}`,
    };
    await closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
      {
        organizationUnitId: closingAttempt.current.organizationUnitId,
        from: closingAttempt.current.from,
        to: closingAttempt.current.to,
      },
      tx,
    );
  }

  return personIds;
}

async function touchTerminalDevice(tx: Prisma.TransactionClient, terminalId: string) {
  const importObservedAt = new Date();
  const existingDevice = await tx.terminalDevice.findUnique({ where: { terminalId } });
  if (existingDevice) {
    return existingDevice.lastSeenAt && existingDevice.lastSeenAt > importObservedAt
      ? existingDevice
      : tx.terminalDevice.update({
          where: { id: existingDevice.id },
          data: { lastSeenAt: importObservedAt },
        });
  }

  return tx.terminalDevice.create({
    data: { terminalId, name: terminalId, lastSeenAt: importObservedAt },
  });
}

async function ingestTerminalRecords(
  tx: Prisma.TransactionClient,
  canonicalRecords: TerminalRecord[],
  duplicateRecordsInPayload: number,
): Promise<BatchOutcomes> {
  let duplicates = duplicateRecordsInPayload;
  let created = 0;
  const conflictFlags: BatchOutcomes['conflictFlags'] = [];
  const unknownTimeTypes: BatchOutcomes['unknownTimeTypes'] = [];

  // This loop intentionally remains sequential: each read/write participates in one transaction.
  for (const record of canonicalRecords) {
    const timeType = await tx.timeType.findUnique({ where: { code: record.timeTypeCode } });
    if (!timeType) {
      unknownTimeTypes.push({
        personId: record.personId,
        startTime: record.startTime,
        timeTypeCode: record.timeTypeCode,
      });
      continue;
    }

    const bookingStart = new Date(record.startTime);
    const bookingEnd = record.endTime ? new Date(record.endTime) : null;
    const existingImportBooking = await tx.booking.findFirst({
      where: {
        personId: record.personId,
        timeTypeId: timeType.id,
        startTime: bookingStart,
        endTime: bookingEnd,
        source: BookingSource.IMPORT,
      },
      select: { id: true },
    });
    if (existingImportBooking) {
      duplicates += 1;
      continue;
    }

    const absenceConflict = await tx.absence.findFirst({
      where: {
        personId: record.personId,
        status: 'APPROVED',
        startDate: { lte: bookingEnd ?? bookingStart },
        endDate: { gte: bookingStart },
      },
    });
    if (absenceConflict) {
      conflictFlags.push({
        personId: record.personId,
        startTime: record.startTime,
        type: 'ABSENCE_CONFLICT',
      });
      continue;
    }

    const bookingOverlap = await tx.booking.findFirst({
      where: bookingOverlapWhere({
        personId: record.personId,
        startTime: bookingStart,
        endTime: bookingEnd,
      }),
    });
    if (bookingOverlap) {
      conflictFlags.push({
        personId: record.personId,
        startTime: record.startTime,
        type: 'BOOKING_OVERLAP',
      });
      continue;
    }

    await tx.booking.create({
      data: {
        personId: record.personId,
        timeTypeId: timeType.id,
        startTime: bookingStart,
        endTime: bookingEnd,
        source: BookingSource.IMPORT,
        note: record.note,
      },
    });
    created += 1;
  }

  return { created, duplicates, conflictFlags, unknownTimeTypes };
}

async function createBatchReceipt(
  tx: Prisma.TransactionClient,
  dependencies: TerminalBatchImportDependencies,
  user: AuthenticatedIdentity,
  actorId: string,
  parsed: TerminalSyncBatchInput,
  terminalDeviceId: string,
  ingestionChecksum: string,
  fileMetrics: TerminalFileMetrics | undefined,
  outcomes: BatchOutcomes,
) {
  const resultPayload = TerminalImportResultPayloadSchema.parse({
    totalRecords: parsed.records.length,
    ...fileMetrics,
    ...outcomes,
    sorted: true,
    ingestionChecksum,
  });
  const batch = await tx.terminalSyncBatch.create({
    data: {
      terminalId: parsed.terminalId,
      terminalDeviceId,
      sourceFile: parsed.sourceFile,
      importedById: actorId,
      rawPayload: parsed as Prisma.InputJsonValue,
      resultPayload: resultPayload as Prisma.InputJsonValue,
      ingestionChecksum,
    },
  });

  await dependencies.auditHelper.appendAudit(
    {
      actorId,
      action: 'TERMINAL_BATCH_IMPORTED',
      entityType: 'TerminalSyncBatch',
      entityId: batch.id,
      after: {
        terminalId: parsed.terminalId,
        ...outcomes,
        ingestionChecksum,
      },
      reason: `Imported by role ${user.role}`,
    },
    tx,
  );

  return { batchId: batch.id, terminalId: parsed.terminalId, ...resultPayload };
}

/** Executes the original atomic terminal import workflow with its durable closing-lock audit. */
export function importTerminalBatch(
  dependencies: TerminalBatchImportDependencies,
  user: AuthenticatedIdentity,
  actorId: string,
  payload: unknown,
  fileMetrics?: TerminalFileMetrics,
) {
  const parsed = TerminalSyncBatchSchema.parse(payload) as TerminalSyncBatchInput;
  const { canonicalRecords, duplicateRecordsInPayload } = normalizeTerminalRecords(parsed.records);
  const ingestionChecksum = createTerminalIngestionChecksum(parsed.terminalId, canonicalRecords);
  const closingAttempt: ClosingAttemptState = {};

  return dependencies.prisma
    .$transaction(async (tx) => {
      await lockTerminalWrites(tx, parsed.terminalId);
      await lockTerminalIngestion(tx, parsed.terminalId, ingestionChecksum);

      const existingBatch = await tx.terminalSyncBatch.findUnique({
        where: {
          terminalId_ingestionChecksum: {
            terminalId: parsed.terminalId,
            ingestionChecksum,
          },
        },
      });
      if (existingBatch) {
        const storedResult = TerminalImportResultPayloadSchema.parse(existingBatch.resultPayload);
        return {
          batchId: existingBatch.id,
          terminalId: existingBatch.terminalId,
          ...storedResult,
          created: 0,
          duplicates: storedResult.duplicates + storedResult.created,
        };
      }

      const personIds = await assertPeopleAndClosingPeriods(
        tx,
        parsed,
        canonicalRecords,
        actorId,
        ingestionChecksum,
        closingAttempt,
        dependencies.closingLockHelper,
      );
      await lockPersonWrites(tx, personIds);

      const terminalDevice = await touchTerminalDevice(tx, parsed.terminalId);
      const outcomes = await ingestTerminalRecords(tx, canonicalRecords, duplicateRecordsInPayload);
      return createBatchReceipt(
        tx,
        dependencies,
        user,
        actorId,
        parsed,
        terminalDevice.id,
        ingestionChecksum,
        fileMetrics,
        outcomes,
      );
    })
    .catch((error: unknown) => {
      if (!closingAttempt.current) throw error;
      return dependencies.closingLockHelper.rethrowWithDurableClosingAudit(
        error,
        closingAttempt.current,
      );
    });
}
