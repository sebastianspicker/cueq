/** Injectable compatibility provider for actor-scoped workflow-domain operations. */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../persistence/prisma.service.js';
import { ClosingLockHelper } from '../helpers/closing-lock.helper.js';
import { PersonHelper } from '../helpers/person.helper.js';
import { WorkflowCreationHelper } from '../helpers/workflow-creation.helper.js';
import { WorkflowSideEffectsHelper } from '../helpers/workflow-side-effects.helper.js';
import { WorkflowRuntimeService } from '../workflow-runtime.service.js';
import { WorkflowsDomainFacade } from './workflow-domain-facade.js';

@Injectable()
export class WorkflowsDomainService extends WorkflowsDomainFacade {
  // prettier-ignore
  constructor(@Inject(PrismaService) prisma: PrismaService, @Inject(PersonHelper) personHelper: PersonHelper, @Inject(WorkflowRuntimeService) workflowRuntimeService: WorkflowRuntimeService, @Inject(WorkflowCreationHelper) creationHelper: WorkflowCreationHelper, @Inject(WorkflowSideEffectsHelper) sideEffectsHelper: WorkflowSideEffectsHelper, @Inject(ClosingLockHelper) closingLockHelper: ClosingLockHelper) { super({ prisma, personHelper, workflowRuntimeService, creationHelper, sideEffectsHelper, closingLockHelper }); }
}
