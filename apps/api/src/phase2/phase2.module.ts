import { Module } from '@nestjs/common';
import { Phase2Service } from './phase2.service';
import { MeController } from './controllers/me.controller';
import { DashboardController } from './controllers/dashboard.controller';
import { BookingsController } from './controllers/bookings.controller';
import { AbsencesController } from './controllers/absences.controller';
import { LeaveBalanceController } from './controllers/leave-balance.controller';
import { CalendarController } from './controllers/calendar.controller';
import { WorkflowsController } from './controllers/workflows.controller';
import { RostersController } from './controllers/rosters.controller';
import { OncallController } from './controllers/oncall.controller';
import { ClosingController } from './controllers/closing.controller';
import { TerminalSyncController } from './controllers/terminal-sync.controller';

@Module({
  providers: [Phase2Service],
  controllers: [
    MeController,
    DashboardController,
    BookingsController,
    AbsencesController,
    LeaveBalanceController,
    CalendarController,
    WorkflowsController,
    RostersController,
    OncallController,
    ClosingController,
    TerminalSyncController,
  ],
  exports: [Phase2Service],
})
export class Phase2Module {}
