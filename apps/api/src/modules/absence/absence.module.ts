/** Leave requests, adjustments, balances, and absence-calendar API surface. */
import { Module } from '@nestjs/common';
import { ABSENCE_WORKFLOW_EFFECTS_PORT } from '../../application/ports/workflow-side-effects.port.js';
import { AuditModule } from '../audit/public.js';
import { PeopleModule } from '../people/public.js';
import { TransactionsModule } from '../../platform/transactions/transactions.module.js';
import { WorkflowRuntimeModule } from '../workflows/workflow-runtime.public.js';
import { AbsenceDomainService } from './absence-domain.service.js';
import { AbsencesController } from './absences.controller.js';
import { CalendarController } from './calendar.controller.js';
import { HolidayProvider } from './holiday.provider.js';
import { LeaveAdjustmentsController } from './leave-adjustments.controller.js';
import { LeaveBalanceController } from './leave-balance.controller.js';
import { LeaveBalanceHelper } from './leave-balance.helper.js';
import { WorkflowAbsenceEffectsService } from './workflow-absence-effects.service.js';

@Module({
  imports: [AuditModule, PeopleModule, TransactionsModule, WorkflowRuntimeModule],
  controllers: [
    AbsencesController,
    CalendarController,
    LeaveAdjustmentsController,
    LeaveBalanceController,
  ],
  providers: [
    AbsenceDomainService,
    HolidayProvider,
    LeaveBalanceHelper,
    WorkflowAbsenceEffectsService,
    { provide: ABSENCE_WORKFLOW_EFFECTS_PORT, useExisting: WorkflowAbsenceEffectsService },
  ],
  exports: [AbsenceDomainService, HolidayProvider, ABSENCE_WORKFLOW_EFFECTS_PORT],
})
export class AbsenceModule {}
