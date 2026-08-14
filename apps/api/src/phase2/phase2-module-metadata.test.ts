import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants.js';
import { afterEach, describe, expect, it } from 'vitest';
import { HR_MASTER_PROVIDER, StubHrMasterProvider } from './hr-master-provider.port.js';
import { HttpHrMasterProvider } from './http-hr-master-provider.adapter.js';
import {
  createHrMasterProvider,
  PHASE2_CONTROLLERS,
  PHASE2_EXPORTS,
  PHASE2_HR_MASTER_PROVIDER,
  PHASE2_PROVIDERS,
} from './phase2-module-metadata.js';
import { Phase2Module } from './phase2.module.js';

const originalHrProviderMode = process.env.HR_PROVIDER_MODE;

afterEach(() => {
  if (originalHrProviderMode === undefined) {
    delete process.env.HR_PROVIDER_MODE;
    return;
  }
  process.env.HR_PROVIDER_MODE = originalHrProviderMode;
});

function tokenNames(tokens: unknown[]): string[] {
  return tokens.map((token) => {
    if (token === PHASE2_HR_MASTER_PROVIDER) return 'HR_MASTER_PROVIDER';
    return typeof token === 'function' ? token.name : String(token);
  });
}

describe('Phase2Module metadata', () => {
  it('preserves the exact provider, controller, and export inventories in order', () => {
    expect(tokenNames(PHASE2_PROVIDERS)).toEqual([
      'AuditHelper',
      'ClosingChecklistHelper',
      'ClosingCorrectionHelper',
      'ClosingExportHelper',
      'ClosingLifecycleHelper',
      'ClosingLockHelper',
      'EventOutboxHelper',
      'HolidayProvider',
      'LeaveBalanceHelper',
      'PersonHelper',
      'ReportingAnalyticsHelper',
      'ReportingComplianceHelper',
      'RosterAssignmentHelper',
      'RosterQueryHelper',
      'RosterShiftHelper',
      'TimeThresholdPolicyHelper',
      'PolicyQueryService',
      'TimeEngineDomainService',
      'ReportingService',
      'ClosingDomainService',
      'RosterDomainService',
      'TerminalGatewayService',
      'HrImportService',
      'HR_MASTER_PROVIDER',
      'WorkflowAssignmentHelper',
      'WorkflowCreationHelper',
      'WorkflowDelegationCrudHelper',
      'WorkflowSideEffectsHelper',
      'WorkflowRuntimeService',
      'WorkflowEscalationService',
      'ClosingCutoffService',
      'DashboardBookingsService',
      'OncallDomainService',
      'WorkflowsDomainService',
      'WebhookDomainService',
      'AbsenceDomainService',
      'BookingDomainService',
    ]);
    expect(tokenNames(PHASE2_CONTROLLERS)).toEqual([
      'AuditController',
      'MeController',
      'DashboardController',
      'BookingsController',
      'AbsencesController',
      'PersonsController',
      'LeaveBalanceController',
      'LeaveAdjustmentsController',
      'CalendarController',
      'WorkflowsController',
      'RostersController',
      'OncallController',
      'ClosingController',
      'TerminalSyncController',
      'TerminalIntegrationController',
      'HrImportController',
      'PoliciesController',
      'IntegrationsController',
      'ReportsController',
      'TimeEngineController',
      'TimeThresholdsController',
    ]);
    expect(tokenNames(PHASE2_EXPORTS)).toEqual([
      'AuditHelper',
      'ClosingLockHelper',
      'EventOutboxHelper',
      'HolidayProvider',
      'PersonHelper',
      'PolicyQueryService',
      'TimeEngineDomainService',
      'ReportingService',
      'ClosingDomainService',
      'RosterDomainService',
      'TerminalGatewayService',
      'HrImportService',
      'WorkflowRuntimeService',
      'DashboardBookingsService',
      'OncallDomainService',
      'WorkflowsDomainService',
      'WebhookDomainService',
      'AbsenceDomainService',
      'BookingDomainService',
    ]);
  });

  it('uses the extracted inventory arrays as the single module metadata values', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, Phase2Module)).toBe(PHASE2_PROVIDERS);
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, Phase2Module)).toBe(PHASE2_CONTROLLERS);
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, Phase2Module)).toBe(PHASE2_EXPORTS);
  });

  it('preserves the HR provider token and resolves its environment mode at factory invocation', () => {
    expect(PHASE2_HR_MASTER_PROVIDER.provide).toBe(HR_MASTER_PROVIDER);
    expect(PHASE2_HR_MASTER_PROVIDER.useFactory).toBe(createHrMasterProvider);

    delete process.env.HR_PROVIDER_MODE;
    expect(createHrMasterProvider()).toBeInstanceOf(StubHrMasterProvider);

    process.env.HR_PROVIDER_MODE = 'HTTP';
    expect(createHrMasterProvider()).toBeInstanceOf(HttpHrMasterProvider);

    process.env.HR_PROVIDER_MODE = 'unsupported';
    expect(createHrMasterProvider()).toBeInstanceOf(StubHrMasterProvider);
  });
});
