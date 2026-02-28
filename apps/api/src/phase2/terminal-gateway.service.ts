import { createHash } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import { BookingSource } from '@cueq/database';
import { buildAuditEntry } from '@cueq/core';
import { z } from 'zod';
import { PrismaService } from '../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../common/auth/auth.types';

const TerminalSyncBatchSchema = z.object({
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
type TerminalHeartbeatInput = z.infer<typeof TerminalHeartbeatSchema>;

@Injectable()
export class TerminalGatewayService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private assertIntegrationToken(token: string | undefined, envVar: string, fallback: string) {
    const expected = process.env[envVar] ?? fallback;
    if (!token || token !== expected) {
      throw new ForbiddenException('Invalid integration token.');
    }
  }

  private async appendAudit(input: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    before?: Prisma.JsonValue;
    after?: Prisma.JsonValue;
    reason?: string;
  }) {
    const draft = buildAuditEntry({
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before,
      after: input.after,
      reason: input.reason,
    });

    await this.prisma.auditEntry.create({
      data: {
        id: draft.id,
        timestamp: new Date(draft.timestamp),
        actorId: draft.actorId,
        action: draft.action,
        entityType: draft.entityType,
        entityId: draft.entityId,
        before: draft.before as Prisma.InputJsonValue,
        after: draft.after as Prisma.InputJsonValue,
        reason: draft.reason ?? undefined,
      },
    });
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
    const conflictFlags: Array<{ personId: string; startTime: string; type: 'ABSENCE_CONFLICT' }> =
      [];

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

    await this.appendAudit({
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

  async getBatch(batchId: string) {
    const batch = await this.prisma.terminalSyncBatch.findUnique({ where: { id: batchId } });
    if (!batch) {
      throw new NotFoundException('Terminal batch not found.');
    }

    return batch;
  }

  async recordHeartbeat(token: string | undefined, payload: unknown) {
    this.assertIntegrationToken(token, 'TERMINAL_GATEWAY_TOKEN', 'dev-terminal-token');
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

    await this.appendAudit({
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

  async health(token: string | undefined) {
    this.assertIntegrationToken(token, 'TERMINAL_GATEWAY_TOKEN', 'dev-terminal-token');

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
