/** Injectable compatibility provider for final workflow decision side effects. */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../persistence/prisma.service.js';
import { AuditHelper } from './audit.helper.js';
import { WorkflowSideEffectsFacade } from './workflow-side-effects-facade.helper.js';

@Injectable()
export class WorkflowSideEffectsHelper extends WorkflowSideEffectsFacade {
  // prettier-ignore
  constructor(@Inject(PrismaService) prisma: PrismaService, @Inject(AuditHelper) auditHelper: AuditHelper) { super({ prisma, auditHelper }); }
}
