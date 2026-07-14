import { createHash } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BookingSource, type Prisma } from '@cueq/database';
import { z } from 'zod';
import { PrismaService } from '../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../common/auth/auth.types';
import { assertIntegrationToken } from '../common/integrations/integration-token';
import { parseCsvRecords } from '../common/csv/parse-csv';
import { AuditHelper } from './helpers/audit.helper';
import { bookingOverlapWhere } from './helpers/booking-overlap.helper';
import { ClosingLockHelper } from './helpers/closing-lock.helper';
import {
  lockPersonWrites,
  lockTerminalIngestion,
  lockTerminalWrites,
} from './helpers/transaction-lock.helper';

const TerminalRecordSchema = z
  .object({
    personId: z.string().cuid(),
    timeTypeCode: z.string().min(1),
    startTime: z.string().datetime(),
    endTime: z.string().datetime().optional(),
    note: z.string().max(1000).optional(),
  })
  .refine(
    (record) =>
      record.endTime === undefined ||
      new Date(record.endTime).getTime() > new Date(record.startTime).getTime(),
    { message: 'endTime must be after startTime', path: ['endTime'] },
  );

export const TerminalSyncBatchSchema = z.object({
  terminalId: z.string().min(1),
  sourceFile: z.string().optional(),
  records: z.array(TerminalRecordSchema),
});

const MAX_TERMINAL_CSV_BYTES = 2_000_000;

export const TerminalSyncBatchFileSchema = z.object({
  terminalId: z.string().min(1),
  sourceFile: z.string().optional(),
  protocol: z.enum(['HONEYWELL_CSV_V1']).default('HONEYWELL_CSV_V1'),
  csv: z.string().min(1).max(MAX_TERMINAL_CSV_BYTES),
});

const TerminalHeartbeatSchema = z.object({
  terminalId: z.string().min(1),
  observedAt: z.string().datetime(),
  bufferedRecords: z.number().int().min(0).default(0),
  errorCount: z.number().int().min(0).default(0),
  details: z
    .union([
      z.record(z.unknown()),
      z.array(z.unknown()),
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
    ])
    .optional(),
});

type TerminalSyncBatchInput = z.infer<typeof TerminalSyncBatchSchema>;
type TerminalSyncBatchFileInput = z.infer<typeof TerminalSyncBatchFileSchema>;
type TerminalHeartbeatInput = z.infer<typeof TerminalHeartbeatSchema>;

const TerminalImportResultPayloadSchema = z.object({
  totalRecords: z.number().int().min(0),
  rawRows: z.number().int().min(0).optional(),
  validRows: z.number().int().min(0).optional(),
  malformedRows: z.number().int().min(0).optional(),
  created: z.number().int().min(0),
  duplicates: z.number().int().min(0),
  conflictFlags: z.array(
    z.object({
      personId: z.string(),
      startTime: z.string(),
      type: z.enum(['ABSENCE_CONFLICT', 'BOOKING_OVERLAP']),
    }),
  ),
  unknownTimeTypes: z.array(
    z.object({
      personId: z.string(),
      startTime: z.string(),
      timeTypeCode: z.string(),
    }),
  ),
  ingestionChecksum: z.string().length(64),
  sorted: z.literal(true),
});

type TerminalFileMetrics = Pick<
  z.infer<typeof TerminalImportResultPayloadSchema>,
  'rawRows' | 'validRows' | 'malformedRows'
>;

const TerminalCsvRowSchema = TerminalRecordSchema;

@Injectable()
export class TerminalGatewayService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(ClosingLockHelper) private readonly closingLockHelper: ClosingLockHelper,
  ) {}

  private parseHoneywellCsv(csv: string): {
    records: Array<{
      personId: string;
      timeTypeCode: string;
      startTime: string;
      endTime?: string;
      note?: string;
    }>;
    rawRows: number;
    validRows: number;
    malformedRows: number;
  } {
    let headers: string[] = [];
    let rows: Array<Record<string, string>> = [];
    try {
      ({ headers, rows } = parseCsvRecords(csv));
    } catch (error) {
      throw new BadRequestException(
        `Invalid Honeywell CSV payload: ${error instanceof Error ? error.message : 'parse error'}`,
      );
    }
    if (headers.length === 0) {
      return { records: [], rawRows: 0, validRows: 0, malformedRows: 0 };
    }
    const requiredHeaders = ['personId', 'timeTypeCode', 'startTime'];
    const missingHeader = requiredHeaders.find((required) => !headers.includes(required));
    if (missingHeader) {
      throw new BadRequestException(`Missing required Honeywell CSV column: ${missingHeader}`);
    }

    const records: Array<{
      personId: string;
      timeTypeCode: string;
      startTime: string;
      endTime?: string;
      note?: string;
    }> = [];
    let malformedRows = 0;

    for (const raw of rows) {
      const parsed = TerminalCsvRowSchema.safeParse({
        personId: raw.personId,
        timeTypeCode: raw.timeTypeCode,
        startTime: raw.startTime,
        endTime: raw.endTime || undefined,
        note: raw.note || undefined,
      });
      if (!parsed.success) {
        malformedRows += 1;
        continue;
      }
      records.push(parsed.data);
    }

    return { records, rawRows: rows.length, validRows: records.length, malformedRows };
  }

  async importBatch(
    user: AuthenticatedIdentity,
    actorId: string,
    payload: unknown,
    fileMetrics?: TerminalFileMetrics,
  ) {
    const parsed = TerminalSyncBatchSchema.parse(payload) as TerminalSyncBatchInput;
    const sorted = [...parsed.records].sort((left, right) => {
      const leftKey = [
        left.startTime,
        left.personId,
        left.timeTypeCode,
        left.endTime ?? '',
        left.note ?? '',
      ].join('\u0000');
      const rightKey = [
        right.startTime,
        right.personId,
        right.timeTypeCode,
        right.endTime ?? '',
        right.note ?? '',
      ].join('\u0000');
      return leftKey.localeCompare(rightKey);
    });
    const seen = new Set<string>();
    const canonicalRecords: Array<{
      personId: string;
      timeTypeCode: string;
      startTime: string;
      endTime?: string;
      note?: string;
    }> = [];

    let duplicateRecordsInPayload = 0;

    for (const record of sorted) {
      const dedupeKey = `${record.personId}:${record.timeTypeCode}:${record.startTime}:${record.endTime ?? ''}`;
      if (seen.has(dedupeKey)) {
        duplicateRecordsInPayload += 1;
        continue;
      }

      seen.add(dedupeKey);
      canonicalRecords.push(record);
    }

    const ingestionChecksum = createHash('sha256')
      .update(
        JSON.stringify({
          terminalId: parsed.terminalId,
          records: canonicalRecords,
        }),
      )
      .digest('hex');
    let closingAttempt:
      | {
          actorId: string;
          organizationUnitId: string | null;
          from: Date;
          to: Date;
          attemptedAction: string;
          entityType: string;
          entityId: string;
        }
      | undefined;

    return this.prisma
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

        const personIds = [...new Set(canonicalRecords.map((record) => record.personId))];
        const people = await tx.person.findMany({
          where: { id: { in: personIds } },
          select: { id: true, organizationUnitId: true },
        });
        const peopleById = new Map(people.map((person) => [person.id, person]));
        for (const record of canonicalRecords) {
          const person = peopleById.get(record.personId);
          if (!person) {
            throw new BadRequestException(
              `Person not found for terminal record: ${record.personId}`,
            );
          }
          const startTime = new Date(record.startTime);
          closingAttempt = {
            actorId,
            organizationUnitId: person.organizationUnitId,
            from: startTime,
            to: record.endTime ? new Date(record.endTime) : startTime,
            attemptedAction: 'TERMINAL_BATCH_IMPORT',
            entityType: 'TerminalSyncBatch',
            entityId: `${parsed.terminalId}:${ingestionChecksum}`,
          };
          await this.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
            {
              organizationUnitId: closingAttempt.organizationUnitId,
              from: closingAttempt.from,
              to: closingAttempt.to,
            },
            tx,
          );
        }

        await lockPersonWrites(tx, personIds);

        const importObservedAt = new Date();
        const existingDevice = await tx.terminalDevice.findUnique({
          where: { terminalId: parsed.terminalId },
        });
        const terminalDevice = existingDevice
          ? existingDevice.lastSeenAt && existingDevice.lastSeenAt > importObservedAt
            ? existingDevice
            : await tx.terminalDevice.update({
                where: { id: existingDevice.id },
                data: { lastSeenAt: importObservedAt },
              })
          : await tx.terminalDevice.create({
              data: {
                terminalId: parsed.terminalId,
                name: parsed.terminalId,
                lastSeenAt: importObservedAt,
              },
            });

        let duplicates = duplicateRecordsInPayload;
        let created = 0;
        const conflictFlags: Array<{
          personId: string;
          startTime: string;
          type: 'ABSENCE_CONFLICT' | 'BOOKING_OVERLAP';
        }> = [];
        const unknownTimeTypes: Array<{
          personId: string;
          startTime: string;
          timeTypeCode: string;
        }> = [];

        for (const record of canonicalRecords) {
          const timeType = await tx.timeType.findUnique({
            where: { code: record.timeTypeCode },
          });

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
              type: 'BOOKING_OVERLAP' as const,
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

        const resultPayload = TerminalImportResultPayloadSchema.parse({
          totalRecords: parsed.records.length,
          ...fileMetrics,
          created,
          duplicates,
          conflictFlags,
          unknownTimeTypes,
          sorted: true,
          ingestionChecksum,
        });

        const batch = await tx.terminalSyncBatch.create({
          data: {
            terminalId: parsed.terminalId,
            terminalDeviceId: terminalDevice.id,
            sourceFile: parsed.sourceFile,
            importedById: actorId,
            rawPayload: parsed as Prisma.InputJsonValue,
            resultPayload: resultPayload as Prisma.InputJsonValue,
            ingestionChecksum,
          },
        });

        await this.auditHelper.appendAudit(
          {
            actorId,
            action: 'TERMINAL_BATCH_IMPORTED',
            entityType: 'TerminalSyncBatch',
            entityId: batch.id,
            after: {
              terminalId: parsed.terminalId,
              created,
              duplicates,
              conflictFlags,
              unknownTimeTypes,
              ingestionChecksum,
            },
            reason: `Imported by role ${user.role}`,
          },
          tx,
        );

        return {
          batchId: batch.id,
          terminalId: parsed.terminalId,
          ...resultPayload,
        };
      })
      .catch((error: unknown) => {
        if (!closingAttempt) throw error;
        return this.closingLockHelper.rethrowWithDurableClosingAudit(error, closingAttempt);
      });
  }

  async importBatchFile(user: AuthenticatedIdentity, actorId: string, payload: unknown) {
    const parsed = TerminalSyncBatchFileSchema.parse(payload) as TerminalSyncBatchFileInput;
    const { records, rawRows, validRows, malformedRows } = this.parseHoneywellCsv(parsed.csv);
    const imported = await this.importBatch(
      user,
      actorId,
      {
        terminalId: parsed.terminalId,
        sourceFile: parsed.sourceFile,
        records,
      },
      { rawRows, validRows, malformedRows },
    );

    return {
      ...imported,
      protocol: parsed.protocol,
      rawRows,
      validRows,
      malformedRows,
    };
  }

  async getBatch(batchId: string) {
    const batch = await this.prisma.terminalSyncBatch.findUnique({ where: { id: batchId } });
    if (!batch) {
      throw new NotFoundException('Terminal batch not found.');
    }

    return batch;
  }

  async recordHeartbeat(token: string | string[] | undefined, payload: unknown) {
    assertIntegrationToken(token, 'TERMINAL_GATEWAY_TOKEN', 'dev-terminal-token');
    const parsed = TerminalHeartbeatSchema.parse(payload) as TerminalHeartbeatInput;
    const observedAt = new Date(parsed.observedAt);

    const heartbeat = await this.prisma.$transaction(async (tx) => {
      await lockTerminalWrites(tx, parsed.terminalId);
      const existingDevice = await tx.terminalDevice.findUnique({
        where: { terminalId: parsed.terminalId },
      });
      const terminalDevice = existingDevice
        ? existingDevice.lastSeenAt && existingDevice.lastSeenAt > observedAt
          ? existingDevice
          : await tx.terminalDevice.update({
              where: { id: existingDevice.id },
              data: {
                lastSeenAt: observedAt,
                lastErrorCount: parsed.errorCount,
              },
            })
        : await tx.terminalDevice.create({
            data: {
              terminalId: parsed.terminalId,
              name: parsed.terminalId,
              lastSeenAt: observedAt,
              lastErrorCount: parsed.errorCount,
            },
          });

      const created = await tx.terminalHeartbeat.create({
        data: {
          terminalDeviceId: terminalDevice.id,
          observedAt,
          bufferedRecords: parsed.bufferedRecords,
          errorCount: parsed.errorCount,
          details: (parsed.details ?? null) as Prisma.InputJsonValue,
        },
      });

      await this.auditHelper.appendAudit(
        {
          actorId: 'system:terminal-gateway',
          action: 'TERMINAL_HEARTBEAT_RECORDED',
          entityType: 'TerminalHeartbeat',
          entityId: created.id,
          after: {
            terminalId: parsed.terminalId,
            observedAt: parsed.observedAt,
            bufferedRecords: parsed.bufferedRecords,
            errorCount: parsed.errorCount,
          },
        },
        tx,
      );

      return created;
    });

    return {
      id: heartbeat.id,
      terminalId: parsed.terminalId,
      observedAt: observedAt.toISOString(),
      bufferedRecords: heartbeat.bufferedRecords,
      errorCount: heartbeat.errorCount,
    };
  }

  async health(token: string | string[] | undefined) {
    assertIntegrationToken(token, 'TERMINAL_GATEWAY_TOKEN', 'dev-terminal-token');

    const now = Date.now();
    const terminals = await this.prisma.terminalDevice.findMany({
      orderBy: { terminalId: 'asc' },
    });

    return {
      generatedAt: new Date(now).toISOString(),
      terminals: terminals.map((terminal) => {
        const lastSeenAt = terminal.lastSeenAt?.toISOString() ?? null;
        return {
          terminalId: terminal.terminalId,
          isActive: terminal.isActive,
          lastSeenAt,
          heartbeatAgeSeconds: lastSeenAt
            ? Math.max(0, Math.floor((now - new Date(lastSeenAt).getTime()) / 1000))
            : null,
          lastErrorCount: terminal.lastErrorCount,
        };
      }),
    };
  }
}
