import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../persistence/prisma.service.js';
import { assertIntegrationToken } from '../common/integrations/integration-token.js';

export async function getTerminalBatch(
  prisma: Pick<PrismaService, 'terminalSyncBatch'>,
  batchId: string,
) {
  const batch = await prisma.terminalSyncBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new NotFoundException('Terminal batch not found.');
  return batch;
}

export async function getTerminalHealth(
  prisma: Pick<PrismaService, 'terminalDevice'>,
  token: string | string[] | undefined,
) {
  assertIntegrationToken(token, 'TERMINAL_GATEWAY_TOKEN', 'dev-terminal-token');
  const now = Date.now();
  const terminals = await prisma.terminalDevice.findMany({ orderBy: { terminalId: 'asc' } });
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
