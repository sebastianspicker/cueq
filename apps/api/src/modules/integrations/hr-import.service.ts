/** Implements validated, auditable HR master-data import runs. */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../persistence/prisma.service.js';
import { AuditHelper } from '../audit/public.js';
import { HR_MASTER_PROVIDER, type HrMasterProviderPort } from './hr-master-provider.port.js';
import { getHrImportRun } from './hr-import-query.js';
import { runHrImport } from './hr-import-runner.js';

/** Stable injectable façade for HR import commands and run lookup. */
@Injectable()
export class HrImportService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(HR_MASTER_PROVIDER) private readonly provider: HrMasterProviderPort,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
  ) {}

  async runImport(token: string | string[] | undefined, payload: unknown) {
    return runHrImport(
      { prisma: this.prisma, provider: this.provider, auditHelper: this.auditHelper },
      token,
      payload,
    );
  }

  async getRun(token: string | string[] | undefined, runId: string): Promise<unknown> {
    return getHrImportRun(this.prisma, token, runId);
  }
}
