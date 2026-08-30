import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import type { PrismaService } from '../../persistence/prisma.service.js';
import { assertIntegrationToken } from './credentials/integration-token.js';
import type { AuditHelper } from '../audit/public.js';
import { lockTerminalWrites } from '../../platform/transactions/transaction-lock.helper.js';
import { TerminalHeartbeatSchema, type TerminalHeartbeatInput } from './terminal-contracts.js';

type TerminalHeartbeatDependencies = {
  prisma: Pick<PrismaService, '$transaction'>;
  auditHelper: AuditHelper;
};

/** Records a heartbeat under the terminal write lock after the integration boundary has authenticated it. */
export async function recordTerminalHeartbeat(
  dependencies: TerminalHeartbeatDependencies,
  token: string | string[] | undefined,
  payload: unknown,
) {
  assertIntegrationToken(token, 'TERMINAL_GATEWAY_TOKEN', 'dev-terminal-token');
  const parsed = TerminalHeartbeatSchema.parse(payload) as TerminalHeartbeatInput;
  const observedAt = new Date(parsed.observedAt);
  const heartbeat = await dependencies.prisma.$transaction(async (tx) => {
    await lockTerminalWrites(tx, parsed.terminalId);
    const existingDevice = await tx.terminalDevice.findUnique({
      where: { terminalId: parsed.terminalId },
    });
    if (!existingDevice?.isActive) {
      throw new NotFoundException('Active terminal device registration not found.');
    }
    const terminalDevice =
      existingDevice.lastSeenAt && existingDevice.lastSeenAt > observedAt
        ? existingDevice
        : await tx.terminalDevice.update({
            where: { id: existingDevice.id },
            data: { lastSeenAt: observedAt, lastErrorCount: parsed.errorCount },
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
    await dependencies.auditHelper.appendAudit(
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
