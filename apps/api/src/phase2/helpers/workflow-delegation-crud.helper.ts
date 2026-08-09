/** Injectable compatibility provider for workflow-delegation CRUD operations. */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../persistence/prisma.service.js';
import { AuditHelper } from './audit.helper.js';
import { WorkflowDelegationCrudFacade } from './workflow-delegation-crud-facade.helper.js';

@Injectable()
export class WorkflowDelegationCrudHelper extends WorkflowDelegationCrudFacade {
  // prettier-ignore
  constructor(@Inject(PrismaService) prisma: PrismaService, @Inject(AuditHelper) auditHelper: AuditHelper) { super({ prisma, auditHelper }); }
}
