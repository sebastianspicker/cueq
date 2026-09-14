/** Booking, recorded-time, and dashboard API surface. */
import { Module } from '@nestjs/common';
import { ATTENDANCE_WORKFLOW_EFFECTS_PORT } from '../../application/ports/workflow-side-effects.port.js';
import { AuditModule } from '../audit/public.js';
import { PeopleModule } from '../people/public.js';
import { TransactionsModule } from '../../platform/transactions/transactions.module.js';
import { BookingDomainService } from './booking-domain.service.js';
import { BookingsController } from './bookings.controller.js';
import { DashboardBookingsService } from './dashboard-bookings.service.js';
import { DashboardController } from './dashboard.controller.js';
import { TimeEngineDomainService } from './time-engine-domain.service.js';
import { TimeEngineController } from './time-engine.controller.js';
import { WorkflowAttendanceEffectsService } from './workflow-attendance-effects.service.js';
import { TIME_ACCOUNTS_PORT } from '../../application/ports/time-accounts.port.js';
import { TimeAccountService } from './time-account.service.js';
import { TimeAccountsController } from './time-accounts.controller.js';

@Module({
  imports: [AuditModule, PeopleModule, TransactionsModule],
  controllers: [
    BookingsController,
    DashboardController,
    TimeEngineController,
    TimeAccountsController,
  ],
  providers: [
    BookingDomainService,
    DashboardBookingsService,
    TimeEngineDomainService,
    WorkflowAttendanceEffectsService,
    TimeAccountService,
    { provide: ATTENDANCE_WORKFLOW_EFFECTS_PORT, useExisting: WorkflowAttendanceEffectsService },
    { provide: TIME_ACCOUNTS_PORT, useExisting: TimeAccountService },
  ],
  exports: [ATTENDANCE_WORKFLOW_EFFECTS_PORT, TIME_ACCOUNTS_PORT],
})
export class AttendanceModule {}
