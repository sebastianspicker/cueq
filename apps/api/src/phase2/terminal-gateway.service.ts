import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingSource, type Prisma } from '@cueq/database';
import { z } from 'zod';
import { PrismaService } from '../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../common/auth/auth.types';
import { assertIntegrationToken } from '../common/integrations/integration-token';
import { parseCsvRecords } from '../common/csv/parse-csv';
import { AuditHelper } from './helpers/audit.helper';

export const TerminalSyncBatchSchema = z.object({
  terminalId: z.string().min(1),
  sourceFile: z.string().optional(),
  records: z.array(
    z.object({
      personId: z.string().cuid(),
      timeTypeCode: z.string().min(1),
      startTime: z.string().datetime(),
      endTime: z.string().datetime().optional(),
      note: z.string().max(1000).optional(),
    }),
  ),
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

const TerminalCsvRowSchema = z.object({
  personId: z.string().cuid(),
  timeTypeCode: z.string().min(1),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  note: z.string().max(1000).optional(),
});

@Injectable()
export class TerminalGatewayService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
  ) {}

  private parseHoneywellCsv(csv: string): {
    records: Array<{
      personId: string;
      timeTypeCode: string;
      startTime: string;
      endTime?: string;
      note?: string;
    }>;
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
      return { records: [], malformedRows: 0 };
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

    return { records, malformedRows };
  }

  async importBatch(user: AuthenticatedIdentity, actorId: string, payload: unknown) {
    const parsed = TerminalSyncBatchSchema.parse(payload) as TerminalSyncBatchInput;
    const sorted = [...parsed.records].sort((left, right) =>
      left.startTime.localeCompare(right.startTime),
    );
    const seen = new Set<string>();
    const canonicalRecords: Array<{
      personId: string;
      timeTypeCode: string;
      startTime: string;
      endTime?: string;
      note?: string;
    }> = [];

    let duplicates = 0;
    let created = 0;
    const conflictFlags: Array<{
      personId: string;
      startTime: string;
      type: 'ABSENCE_CONFLICT' | 'BOOKING_OVERLAP';
    }> = [];

    const terminalDevice = await this.prisma.terminalDevice.upsert({
      where: { terminalId: parsed.terminalId },
      create: {
        terminalId: parsed.terminalId,
        name: parsed.terminalId,
        lastSeenAt: new Date(),
      },
      update: {
        lastSeenAt: new Date(),
      },
    });

    for (const record of sorted) {
      const dedupeKey = `${record.personId}:${record.timeTypeCode}:${record.startTime}:${record.endTime ?? ''}`;
      if (seen.has(dedupeKey)) {
        duplicates += 1;
        continue;
      }

      seen.add(dedupeKey);
      canonicalRecords.push(record);

      const timeType = await this.prisma.timeType.findFirst({
        where: { code: record.timeTypeCode },
      });

      if (!timeType) {
        continue;
      }

      const bookingStart = new Date(record.startTime);
      const bookingEnd = new Date(record.endTime ?? record.startTime);
      const existingImportBooking = await this.prisma.booking.findFirst({
        where: {
          personId: record.personId,
          timeTypeId: timeType.id,
          startTime: bookingStart,
          endTime: record.endTime ? bookingEnd : null,
          source: BookingSource.IMPORT,
        },
        select: { id: true },
      });
      if (existingImportBooking) {
        duplicates += 1;
        continue;
      }

      const absenceConflict = await this.prisma.absence.findFirst({
        where: {
          personId: record.personId,
          status: 'APPROVED',
          startDate: { lte: bookingEnd },
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

      const bookingOverlap = await this.prisma.booking.findFirst({
        where: {
          personId: record.personId,
          startTime: { lt: bookingEnd },
          endTime: { gt: bookingStart },
        },
      });
      if (bookingOverlap) {
        conflictFlags.push({
          personId: record.personId,
          startTime: record.startTime,
          type: 'BOOKING_OVERLAP' as const,
        });
        continue;
      }

      await this.prisma.booking.create({
        data: {
          personId: record.personId,
          timeTypeId: timeType.id,
          startTime: bookingStart,
          endTime: record.endTime ? bookingEnd : null,
          source: BookingSource.IMPORT,
          note: record.note,
        },
      });

      created += 1;
    }

    const ingestionChecksum = createHash('sha256')
      .update(
        JSON.stringify({
          terminalId: parsed.terminalId,
          records: canonicalRecords,
        }),
      )
      .digest('hex');

    const batch = await this.prisma.terminalSyncBatch.create({
      data: {
        terminalId: parsed.terminalId,
        terminalDeviceId: terminalDevice.id,
        sourceFile: parsed.sourceFile,
        importedById: actorId,
        rawPayload: parsed as Prisma.InputJsonValue,
        resultPayload: {
          totalRecords: parsed.records.length,
          created,
          duplicates,
          conflictFlags,
          sorted: true,
          ingestionChecksum,
        } as Prisma.InputJsonValue,
      },
    });

    await this.auditHelper.appendAudit({
      actorId,
      action: 'TERMINAL_BATCH_IMPORTED',
      entityType: 'TerminalSyncBatch',
      entityId: batch.id,
      after: {
        terminalId: parsed.terminalId,
        created,
        duplicates,
        conflictFlags,
        ingestionChecksum,
      },
      reason: `Imported by role ${user.role}`,
    });

    return {
      batchId: batch.id,
      terminalId: parsed.terminalId,
      totalRecords: parsed.records.length,
      created,
      duplicates,
      conflictFlags,
      ingestionChecksum,
      sorted: true,
    };
  }

  async importBatchFile(user: AuthenticatedIdentity, actorId: string, payload: unknown) {
    const parsed = TerminalSyncBatchFileSchema.parse(payload) as TerminalSyncBatchFileInput;
    const { records, malformedRows } = this.parseHoneywellCsv(parsed.csv);
    const imported = await this.importBatch(user, actorId, {
      terminalId: parsed.terminalId,
      sourceFile: parsed.sourceFile,
      records,
    });

    return {
      ...imported,
      protocol: parsed.protocol,
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

    const terminalDevice = await this.prisma.terminalDevice.upsert({
      where: { terminalId: parsed.terminalId },
      create: {
        terminalId: parsed.terminalId,
        name: parsed.terminalId,
        lastSeenAt: observedAt,
        lastErrorCount: parsed.errorCount,
      },
      update: {
        lastSeenAt: observedAt,
        lastErrorCount: parsed.errorCount,
      },
    });

    const heartbeat = await this.prisma.terminalHeartbeat.create({
      data: {
        terminalDeviceId: terminalDevice.id,
        observedAt,
        bufferedRecords: parsed.bufferedRecords,
        errorCount: parsed.errorCount,
        details: (parsed.details ?? null) as Prisma.InputJsonValue,
      },
    });

    await this.auditHelper.appendAudit({
      actorId: 'system:terminal-gateway',
      action: 'TERMINAL_HEARTBEAT_RECORDED',
      entityType: 'TerminalHeartbeat',
      entityId: heartbeat.id,
      after: {
        terminalId: parsed.terminalId,
        observedAt: parsed.observedAt,
        bufferedRecords: parsed.bufferedRecords,
        errorCount: parsed.errorCount,
      },
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
