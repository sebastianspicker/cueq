/** Implements terminal batch ingestion, heartbeat tracking, and health reporting. */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import {
  importTerminalBatch,
  type TerminalBatchImportDependencies,
} from './terminal-batch-import.helper.js';
import type { TerminalFileMetrics } from './terminal-contracts.js';
import { importTerminalBatchFile } from './terminal-file-import.js';
import { getTerminalBatch, getTerminalHealth } from './terminal-health.js';
import { recordTerminalHeartbeat } from './terminal-heartbeat.js';
import { AuditHelper } from '../audit/public.js';
import { ClosingLockHelper } from '../../platform/transactions/closing-lock.helper.js';

/** Keeps the established Nest provider and public API while delegating focused terminal operations. */
@Injectable()
export class TerminalGatewayService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(ClosingLockHelper) private readonly closingLockHelper: ClosingLockHelper,
  ) {}

  private dependencies(): TerminalBatchImportDependencies {
    return {
      prisma: this.prisma,
      auditHelper: this.auditHelper,
      closingLockHelper: this.closingLockHelper,
    };
  }

  async importBatch(
    user: AuthenticatedIdentity,
    actorId: string,
    payload: unknown,
    fileMetrics?: TerminalFileMetrics,
  ) {
    return importTerminalBatch(this.dependencies(), user, actorId, payload, fileMetrics);
  }
  async importBatchFile(user: AuthenticatedIdentity, actorId: string, payload: unknown) {
    return importTerminalBatchFile(this.dependencies(), user, actorId, payload);
  }
  async getBatch(batchId: string) {
    return getTerminalBatch(this.prisma, batchId);
  }
  async recordHeartbeat(token: string | string[] | undefined, payload: unknown) {
    return recordTerminalHeartbeat(this.dependencies(), token, payload);
  }
  async health(token: string | string[] | undefined) {
    return getTerminalHealth(this.prisma, token);
  }
}
