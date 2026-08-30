/** Roster and on-call scheduling API surface. */
import { Module } from '@nestjs/common';
import { SCHEDULING_WORKFLOW_EFFECTS_PORT } from '../../application/ports/workflow-side-effects.port.js';
import { AuditModule } from '../audit/public.js';
import { PeopleModule } from '../people/public.js';
import { TransactionsModule } from '../../platform/transactions/transactions.module.js';
import { OncallDomainService } from './oncall-domain.service.js';
import { OncallController } from './oncall.controller.js';
import { RosterAssignmentHelper } from './roster-assignment.helper.js';
import { RosterDomainService } from './roster-domain.service.js';
import { RosterQueryHelper } from './roster-query.helper.js';
import { RosterShiftHelper } from './roster-shift.helper.js';
import { RostersController } from './rosters.controller.js';
import { WorkflowSchedulingEffectsService } from './workflow-scheduling-effects.service.js';

@Module({
  imports: [AuditModule, PeopleModule, TransactionsModule],
  controllers: [OncallController, RostersController],
  providers: [
    OncallDomainService,
    RosterAssignmentHelper,
    RosterDomainService,
    RosterQueryHelper,
    RosterShiftHelper,
    WorkflowSchedulingEffectsService,
    { provide: SCHEDULING_WORKFLOW_EFFECTS_PORT, useExisting: WorkflowSchedulingEffectsService },
  ],
  exports: [OncallDomainService, RosterDomainService, SCHEDULING_WORKFLOW_EFFECTS_PORT],
})
export class SchedulingModule {}
