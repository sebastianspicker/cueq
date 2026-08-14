/** Declares the stable Phase 2 Nest metadata inventory and HR provider factory. */
import { AbsencesController } from './controllers/absences.controller.js';
import { AuditController } from './controllers/audit.controller.js';
import { BookingsController } from './controllers/bookings.controller.js';
import { CalendarController } from './controllers/calendar.controller.js';
import { ClosingController } from './controllers/closing.controller.js';
import { DashboardController } from './controllers/dashboard.controller.js';
import { IntegrationsController } from './controllers/integrations.controller.js';
import { LeaveAdjustmentsController } from './controllers/leave-adjustments.controller.js';
import { LeaveBalanceController } from './controllers/leave-balance.controller.js';
import { MeController } from './controllers/me.controller.js';
import { OncallController } from './controllers/oncall.controller.js';
import { PersonsController } from './controllers/persons.controller.js';
import { PoliciesController } from './controllers/policies.controller.js';
import { ReportsController } from './controllers/reports.controller.js';
import { RostersController } from './controllers/rosters.controller.js';
import { TerminalIntegrationController } from './controllers/terminal-integration.controller.js';
import { TerminalSyncController } from './controllers/terminal-sync.controller.js';
import { TimeEngineController } from './controllers/time-engine.controller.js';
import { TimeThresholdsController } from './controllers/time-thresholds.controller.js';
import { WorkflowsController } from './controllers/workflows.controller.js';
import { HrImportController } from './controllers/hr-import.controller.js';
import { ClosingChecklistHelper } from './helpers/closing-checklist.helper.js';
import { ClosingCorrectionHelper } from './helpers/closing-correction.helper.js';
import { ClosingExportHelper } from './helpers/closing-export.helper.js';
import { ClosingLifecycleHelper } from './helpers/closing-lifecycle.helper.js';
import { ClosingLockHelper } from './helpers/closing-lock.helper.js';
import { EventOutboxHelper } from './helpers/event-outbox.helper.js';
import { HolidayProvider } from './helpers/holiday.provider.js';
import { LeaveBalanceHelper } from './helpers/leave-balance.helper.js';
import { PersonHelper } from './helpers/person.helper.js';
import { ReportingAnalyticsHelper } from './helpers/reporting-analytics.helper.js';
import { ReportingComplianceHelper } from './helpers/reporting-compliance.helper.js';
import { RosterAssignmentHelper } from './helpers/roster-assignment.helper.js';
import { RosterQueryHelper } from './helpers/roster-query.helper.js';
import { RosterShiftHelper } from './helpers/roster-shift.helper.js';
import { TimeThresholdPolicyHelper } from './helpers/time-threshold-policy.helper.js';
import { WorkflowAssignmentHelper } from './helpers/workflow-assignment.helper.js';
import { WorkflowCreationHelper } from './helpers/workflow-creation.helper.js';
import { WorkflowDelegationCrudHelper } from './helpers/workflow-delegation-crud.helper.js';
import { WorkflowSideEffectsHelper } from './helpers/workflow-side-effects.helper.js';
import { HttpHrMasterProvider } from './http-hr-master-provider.adapter.js';
import { HR_MASTER_PROVIDER, StubHrMasterProvider } from './hr-master-provider.port.js';
import { ClosingCutoffService } from './closing-cutoff.service.js';
import { DashboardBookingsService } from './services/dashboard-bookings.service.js';
import { OncallDomainService } from './services/oncall-domain.service.js';
import { PolicyQueryService } from './services/policy-query.service.js';
import { ReportingService } from './services/reporting.service.js';
import { RosterDomainService } from './services/roster-domain.service.js';
import { TimeEngineDomainService } from './services/time-engine-domain.service.js';
import { WebhookDomainService } from './services/webhook-domain.service.js';
import { WorkflowsDomainService } from './services/workflows-domain.service.js';
import { AbsenceDomainService } from './services/absence-domain.service.js';
import { BookingDomainService } from './services/booking-domain.service.js';
import { ClosingDomainService } from './services/closing-domain.service.js';
import { HrImportService } from './hr-import.service.js';
import { TerminalGatewayService } from './terminal-gateway.service.js';
import { WorkflowEscalationService } from './workflow-escalation.service.js';
import { WorkflowRuntimeService } from './workflow-runtime.service.js';
import { AuditHelper } from './helpers/audit.helper.js';

/** Resolves the configured provider only when Nest instantiates the token. */
export function createHrMasterProvider() {
  // Default to deterministic local data; `http` mode is the pilot adapter
  // for an external HR master-data system.
  const mode = (process.env.HR_PROVIDER_MODE ?? 'stub').toLowerCase();
  if (mode === 'http') {
    return new HttpHrMasterProvider();
  }
  return new StubHrMasterProvider();
}

export const PHASE2_HR_MASTER_PROVIDER = {
  provide: HR_MASTER_PROVIDER,
  useFactory: createHrMasterProvider,
};

export const PHASE2_PROVIDERS = [
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
  PolicyQueryService,
  TimeEngineDomainService,
  ReportingService,
  ClosingDomainService,
  RosterDomainService,
  TerminalGatewayService,
  HrImportService,
  PHASE2_HR_MASTER_PROVIDER,
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
];

export const PHASE2_CONTROLLERS = [
  AuditController,
  MeController,
  DashboardController,
  BookingsController,
  AbsencesController,
  PersonsController,
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
];

export const PHASE2_EXPORTS = [
  AuditHelper,
  ClosingLockHelper,
  EventOutboxHelper,
  HolidayProvider,
  PersonHelper,
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
];
