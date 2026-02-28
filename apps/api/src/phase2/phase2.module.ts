import { Module } from '@nestjs/common';
import { Phase2Service } from './phase2.service';
import { MeController } from './controllers/me.controller';
import { DashboardController } from './controllers/dashboard.controller';
import { BookingsController } from './controllers/bookings.controller';
import { AbsencesController } from './controllers/absences.controller';
import { LeaveBalanceController } from './controllers/leave-balance.controller';
import { LeaveAdjustmentsController } from './controllers/leave-adjustments.controller';
import { CalendarController } from './controllers/calendar.controller';
import { WorkflowsController } from './controllers/workflows.controller';
import { RostersController } from './controllers/rosters.controller';
import { OncallController } from './controllers/oncall.controller';
import { ClosingController } from './controllers/closing.controller';
import { TerminalSyncController } from './controllers/terminal-sync.controller';
import { TerminalIntegrationController } from './controllers/terminal-integration.controller';
import { HrImportController } from './controllers/hr-import.controller';
import { TerminalGatewayService } from './terminal-gateway.service';
import { HrImportService } from './hr-import.service';
import { StubHrMasterProvider } from './hr-master-provider.port';
import { PoliciesController } from './controllers/policies.controller';
import { IntegrationsController } from './controllers/integrations.controller';
import { ReportsController } from './controllers/reports.controller';
import { TimeEngineController } from './controllers/time-engine.controller';

@Module({
  providers: [Phase2Service, TerminalGatewayService, HrImportService, StubHrMasterProvider],
  controllers: [
    MeController,
    DashboardController,
    BookingsController,
    AbsencesController,
    LeaveBalanceController,
    LeaveAdjustmentsController,
    CalendarController,
    WorkflowsController,
    RostersController,
    OncallController,
    ClosingController,
    TerminalSyncController,
    TerminalIntegrationController,
    HrImportController,
    PoliciesController,
    IntegrationsController,
    ReportsController,
    TimeEngineController,
  ],
  exports: [Phase2Service, TerminalGatewayService, HrImportService],
})
export class Phase2Module {}
