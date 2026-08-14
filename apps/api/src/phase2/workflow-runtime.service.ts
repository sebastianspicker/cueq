/** Injectable compatibility provider for workflow runtime operations. */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma.service.js';
import { AuditHelper } from './helpers/audit.helper.js';
import { WorkflowAssignmentHelper } from './helpers/workflow-assignment.helper.js';
import { WorkflowDelegationCrudHelper } from './helpers/workflow-delegation-crud.helper.js';
import { WorkflowSideEffectsHelper } from './helpers/workflow-side-effects.helper.js';
import { WorkflowRuntimeFacade } from './workflow-runtime-facade.js';

export type {
  WorkflowActor,
  WorkflowAssignmentInput,
  WorkflowAssignmentResult,
  WorkflowDecisionResult,
} from './helpers/workflow-utils.js';

@Injectable()
export class WorkflowRuntimeService extends WorkflowRuntimeFacade {
  // prettier-ignore
  constructor(@Inject(PrismaService) prisma: PrismaService, @Inject(AuditHelper) auditHelper: AuditHelper, @Inject(WorkflowAssignmentHelper) assignmentHelper: WorkflowAssignmentHelper, @Inject(WorkflowDelegationCrudHelper) delegationCrud: WorkflowDelegationCrudHelper, @Inject(WorkflowSideEffectsHelper) sideEffectsHelper: WorkflowSideEffectsHelper) { super({ prisma, auditHelper, assignmentHelper, delegationCrud, sideEffectsHelper }); }
}
