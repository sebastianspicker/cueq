import { Module } from '@nestjs/common';
import { Phase2Service } from './phase2.service';
import { AuditController } from './controllers/audit.controller';
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
import { HR_MASTER_PROVIDER, StubHrMasterProvider } from './hr-master-provider.port';
import { HttpHrMasterProvider } from './http-hr-master-provider.adapter';
import { PoliciesController } from './controllers/policies.controller';
import { IntegrationsController } from './controllers/integrations.controller';
import { ReportsController } from './controllers/reports.controller';
import { TimeEngineController } from './controllers/time-engine.controller';
import { TimeThresholdsController } from './controllers/time-thresholds.controller';
import { WorkflowAssignmentHelper } from './helpers/workflow-assignment.helper';
import { WorkflowCreationHelper } from './helpers/workflow-creation.helper';
import { WorkflowDelegationCrudHelper } from './helpers/workflow-delegation-crud.helper';
import { WorkflowSideEffectsHelper } from './helpers/workflow-side-effects.helper';
import { WorkflowRuntimeService } from './workflow-runtime.service';
import { WorkflowEscalationService } from './workflow-escalation.service';
import { ClosingCutoffService } from './closing-cutoff.service';
import { DashboardBookingsService } from './services/dashboard-bookings.service';
import { OncallDomainService } from './services/oncall-domain.service';
import { WorkflowsDomainService } from './services/workflows-domain.service';
import { AuditHelper } from './helpers/audit.helper';
import { ClosingChecklistHelper } from './helpers/closing-checklist.helper';
import { ClosingCorrectionHelper } from './helpers/closing-correction.helper';
import { ClosingExportHelper } from './helpers/closing-export.helper';
import { ClosingLifecycleHelper } from './helpers/closing-lifecycle.helper';
import { ClosingLockHelper } from './helpers/closing-lock.helper';
import { EventOutboxHelper } from './helpers/event-outbox.helper';
import { HolidayProvider } from './helpers/holiday.provider';
import { LeaveBalanceHelper } from './helpers/leave-balance.helper';
import { PersonHelper } from './helpers/person.helper';
import { ReportingAnalyticsHelper } from './helpers/reporting-analytics.helper';
import { ReportingComplianceHelper } from './helpers/reporting-compliance.helper';
import { RosterAssignmentHelper } from './helpers/roster-assignment.helper';
import { RosterQueryHelper } from './helpers/roster-query.helper';
import { RosterShiftHelper } from './helpers/roster-shift.helper';
import { TimeThresholdPolicyHelper } from './helpers/time-threshold-policy.helper';
import { PolicyQueryService } from './services/policy-query.service';
import { TimeEngineDomainService } from './services/time-engine-domain.service';
import { ReportingService } from './services/reporting.service';
import { ClosingDomainService } from './services/closing-domain.service';
import { RosterDomainService } from './services/roster-domain.service';
import { WebhookDomainService } from './services/webhook-domain.service';
import { AbsenceDomainService } from './services/absence-domain.service';
import { BookingDomainService } from './services/booking-domain.service';

@Module({
  providers: [
    AuditHelper,
    ClosingChecklistHelper,
    ClosingCorrectionHelper,
    ClosingExportHelper,
    ClosingLifecycleHelper,
    ClosingLockHelper,
    EventOutboxHelper,
    HolidayProvider,
    LeaveBalanceHelper,
    PersonHelper,
    ReportingAnalyticsHelper,
    ReportingComplianceHelper,
    RosterAssignmentHelper,
    RosterQueryHelper,
    RosterShiftHelper,
    TimeThresholdPolicyHelper,
    Phase2Service,
    PolicyQueryService,
    TimeEngineDomainService,
    ReportingService,
    ClosingDomainService,
    RosterDomainService,
    TerminalGatewayService,
    HrImportService,
    {
      provide: HR_MASTER_PROVIDER,
      useFactory: () => {
        const mode = (process.env.HR_PROVIDER_MODE ?? 'stub').toLowerCase();
        if (mode === 'http') {
          return new HttpHrMasterProvider();
        }
        return new StubHrMasterProvider();
      },
    },
    WorkflowAssignmentHelper,
    WorkflowCreationHelper,
    WorkflowDelegationCrudHelper,
    WorkflowSideEffectsHelper,
    WorkflowRuntimeService,
    WorkflowEscalationService,
    ClosingCutoffService,
    DashboardBookingsService,
    OncallDomainService,
    WorkflowsDomainService,
    WebhookDomainService,
    AbsenceDomainService,
    BookingDomainService,
  ],
  controllers: [
    AuditController,
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
    TimeThresholdsController,
  ],
  exports: [
    AuditHelper,
    ClosingLockHelper,
    EventOutboxHelper,
    HolidayProvider,
    PersonHelper,
    Phase2Service,
    PolicyQueryService,
    TimeEngineDomainService,
    ReportingService,
    ClosingDomainService,
    RosterDomainService,
    TerminalGatewayService,
    HrImportService,
    WorkflowRuntimeService,
    DashboardBookingsService,
    OncallDomainService,
    WorkflowsDomainService,
    WebhookDomainService,
    AbsenceDomainService,
    BookingDomainService,
  ],
})
export class Phase2Module {}
