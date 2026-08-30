/** Approval workflow orchestration and its private persistence collaborators. */
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public.js';
import { AbsenceModule } from '../absence/public.js';
import { AttendanceModule } from '../attendance/public.js';
import { PeopleModule } from '../people/public.js';
import { SchedulingModule } from '../scheduling/public.js';
import { TransactionsModule } from '../../platform/transactions/transactions.module.js';
import { WorkflowCreationHelper } from './workflow-creation.helper.js';
import { WorkflowDecisionService } from './workflow-decision.service.js';
import { WorkflowEscalationService } from './workflow-escalation.service.js';
import { WorkflowRuntimeModule } from './workflow-runtime.module.js';
import { WorkflowSideEffectsHelper } from './workflow-side-effects.helper.js';
import { WorkflowsDomainService } from './workflows-domain.service.js';
import { WorkflowsController } from './workflows.controller.js';

@Module({
  imports: [
    AuditModule,
    PeopleModule,
    TransactionsModule,
    AttendanceModule,
    SchedulingModule,
    AbsenceModule,
    WorkflowRuntimeModule,
  ],
  controllers: [WorkflowsController],
  providers: [
    WorkflowCreationHelper,
    WorkflowDecisionService,
    WorkflowEscalationService,
    WorkflowSideEffectsHelper,
    WorkflowsDomainService,
  ],
  exports: [WorkflowsDomainService],
})
export class WorkflowsModule {}
