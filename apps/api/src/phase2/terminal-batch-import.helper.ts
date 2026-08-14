/** Transaction-scoped terminal batch ingestion workflow. */
import { BadRequestException } from '@nestjs/common';
import { BookingSource, type Prisma } from '@cueq/database';
import type { AuthenticatedIdentity } from '../common/auth/auth.types.js';
import type { PrismaService } from '../persistence/prisma.service.js';
import type { AuditHelper } from './helpers/audit.helper.js';
import type {
  ClosingBlockedAttemptInput,
  ClosingLockHelper,
} from './helpers/closing-lock.helper.js';
import { closingBlockedAttemptFromError } from './helpers/closing-lock.helper.js';
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

type ImportBookingLookup = {
  personId: string;
  timeTypeId: string;
  startTime: Date;
  endTime: Date | null;
};

type ApprovedAbsenceLookup = {
  personId: string;
  startDate: Date;
  endDate: Date;
};

type ExistingBookingLookup = ImportBookingLookup & { source: BookingSource };
type KnownTerminalRecord = {
  record: TerminalRecord;
  lookup: ImportBookingLookup;
};

function importBookingKey(booking: ImportBookingLookup) {
  return JSON.stringify([
    booking.personId,
    booking.timeTypeId,
    booking.startTime.getTime(),
    booking.endTime?.getTime() ?? null,
  ]);
}

function indexByPerson<T extends { personId: string }>(records: T[]) {
  const recordsByPerson = new Map<string, T[]>();
  for (const record of records) {
    const personRecords = recordsByPerson.get(record.personId);
    if (personRecords) personRecords.push(record);
    else recordsByPerson.set(record.personId, [record]);
  }
  return recordsByPerson;
}

function hasOverlappingBooking(candidate: ImportBookingLookup, booking: ExistingBookingLookup) {
  if (candidate.endTime) {
    return (
      booking.startTime < candidate.endTime &&
      (booking.endTime === null || booking.endTime > candidate.startTime)
    );
  }

  return booking.endTime === null || booking.endTime > candidate.startTime;
}

function bookingPreloadWhere(knownRecords: KnownTerminalRecord[]): Prisma.BookingWhereInput {
  const boundedRecords = knownRecords.filter(({ lookup }) => lookup.endTime !== null);
  const openRecords = knownRecords.filter(({ lookup }) => lookup.endTime === null);
  const overlapWindows: Prisma.BookingWhereInput[] = [];

  if (boundedRecords.length > 0) {
    const personIds = [...new Set(boundedRecords.map(({ lookup }) => lookup.personId))];
    const earliestStart = new Date(
      Math.min(...boundedRecords.map(({ lookup }) => lookup.startTime.getTime())),
    );
    const latestEnd = new Date(
      Math.max(
        ...boundedRecords.map(({ lookup }) => (lookup.endTime ?? lookup.startTime).getTime()),
      ),
    );
    overlapWindows.push({
      personId: { in: personIds },
      startTime: { lt: latestEnd },
      OR: [{ endTime: null }, { endTime: { gt: earliestStart } }],
    });
  }

  if (openRecords.length > 0) {
    const personIds = [...new Set(openRecords.map(({ lookup }) => lookup.personId))];
    const earliestStart = new Date(
      Math.min(...openRecords.map(({ lookup }) => lookup.startTime.getTime())),
    );
    overlapWindows.push({
      personId: { in: personIds },
      OR: [{ endTime: null }, { endTime: { gt: earliestStart } }],
    });
  }

  return { OR: overlapWindows };
}

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

  const closingAttempts: ClosingBlockedAttemptInput[] = [];
  for (const record of canonicalRecords) {
    const person = peopleById.get(record.personId);
    if (!person) {
      throw new BadRequestException(`Person not found for terminal record: ${record.personId}`);
    }

    const startTime = new Date(record.startTime);
    closingAttempts.push({
      actorId,
      organizationUnitId: person.organizationUnitId,
      from: startTime,
      to: record.endTime ? new Date(record.endTime) : startTime,
      attemptedAction: 'TERMINAL_BATCH_IMPORT',
      entityType: 'TerminalSyncBatch',
      entityId: `${parsed.terminalId}:${ingestionChecksum}`,
    });
  }

  try {
    await closingLockHelper.assertClosingPeriodsUnlockedForRangesInTransaction(closingAttempts, tx);
  } catch (error) {
    closingAttempt.current = closingBlockedAttemptFromError(error);
    throw error;
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
  const acceptedBookings: Prisma.BookingCreateManyInput[] = [];
  const conflictFlags: BatchOutcomes['conflictFlags'] = [];
  const unknownTimeTypes: BatchOutcomes['unknownTimeTypes'] = [];

  const timeTypeCodes = [...new Set(canonicalRecords.map((record) => record.timeTypeCode))];
  const timeTypes = await tx.timeType.findMany({
    where: { code: { in: timeTypeCodes } },
    select: { id: true, code: true },
  });
  const timeTypesByCode = new Map(timeTypes.map((timeType) => [timeType.code, timeType]));
  const knownRecords: KnownTerminalRecord[] = canonicalRecords.flatMap((record) => {
    const timeType = timeTypesByCode.get(record.timeTypeCode);
    if (!timeType) return [];
    return [
      {
        record,
        lookup: {
          personId: record.personId,
          timeTypeId: timeType.id,
          startTime: new Date(record.startTime),
          endTime: record.endTime ? new Date(record.endTime) : null,
        },
      },
    ];
  });
  let approvedAbsences: ApprovedAbsenceLookup[] = [];
  let existingBookings: ExistingBookingLookup[] = [];
  if (knownRecords.length > 0) {
    const personIds = [...new Set(knownRecords.map(({ lookup }) => lookup.personId))];
    const earliestStart = new Date(
      Math.min(...knownRecords.map(({ lookup }) => lookup.startTime.getTime())),
    );
    const latestEnd = new Date(
      Math.max(...knownRecords.map(({ lookup }) => (lookup.endTime ?? lookup.startTime).getTime())),
    );
    [approvedAbsences, existingBookings] = await Promise.all([
      tx.absence.findMany({
        where: {
          personId: { in: personIds },
          status: 'APPROVED',
          startDate: { lte: latestEnd },
          endDate: { gte: earliestStart },
        },
        select: { personId: true, startDate: true, endDate: true },
      }),
      tx.booking.findMany({
        where: bookingPreloadWhere(knownRecords),
        select: { personId: true, timeTypeId: true, startTime: true, endTime: true, source: true },
      }),
    ]);
  }
  const duplicateImportBookingKeys = new Set(
    existingBookings
      .filter((booking) => booking.source === BookingSource.IMPORT)
      .map(importBookingKey),
  );
  const approvedAbsencesByPerson = indexByPerson<ApprovedAbsenceLookup>(approvedAbsences);
  const bookingsByPerson = indexByPerson<ExistingBookingLookup>(existingBookings);

  // Writes remain sequential so later records observe earlier accepted records in this batch.
  for (const record of canonicalRecords) {
    const timeType = timeTypesByCode.get(record.timeTypeCode);
    if (!timeType) {
      unknownTimeTypes.push({
        personId: record.personId,
        startTime: record.startTime,
        timeTypeCode: record.timeTypeCode,
      });
      continue;
    }

    const lookup: ImportBookingLookup = {
      personId: record.personId,
      timeTypeId: timeType.id,
      startTime: new Date(record.startTime),
      endTime: record.endTime ? new Date(record.endTime) : null,
    };
    if (duplicateImportBookingKeys.has(importBookingKey(lookup))) {
      duplicates += 1;
      continue;
    }

    const absenceConflict = approvedAbsencesByPerson
      .get(record.personId)
      ?.some(
        (absence) =>
          absence.startDate <= (lookup.endTime ?? lookup.startTime) &&
          absence.endDate >= lookup.startTime,
      );
    if (absenceConflict) {
      conflictFlags.push({
        personId: record.personId,
        startTime: record.startTime,
        type: 'ABSENCE_CONFLICT',
      });
      continue;
    }

    const bookingOverlap = bookingsByPerson
      .get(record.personId)
      ?.some((booking) => hasOverlappingBooking(lookup, booking));
    if (bookingOverlap) {
      conflictFlags.push({
        personId: record.personId,
        startTime: record.startTime,
        type: 'BOOKING_OVERLAP',
      });
      continue;
    }

    acceptedBookings.push({
      personId: record.personId,
      timeTypeId: timeType.id,
      startTime: lookup.startTime,
      endTime: lookup.endTime,
      source: BookingSource.IMPORT,
      note: record.note,
    });
    const personBookings = bookingsByPerson.get(record.personId);
    const createdBooking: ExistingBookingLookup = { ...lookup, source: BookingSource.IMPORT };
    if (personBookings) personBookings.push(createdBooking);
    else bookingsByPerson.set(record.personId, [createdBooking]);
  }

  if (acceptedBookings.length > 0) {
    await tx.booking.createMany({ data: acceptedBookings });
  }

  return { created: acceptedBookings.length, duplicates, conflictFlags, unknownTimeTypes };
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
