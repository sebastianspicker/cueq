/** Webhook, terminal, and HR-master integration API surface. */
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public.js';
import { PeopleModule } from '../people/public.js';
import { TransactionsModule } from '../../platform/transactions/transactions.module.js';
import { HrImportController } from './hr-import.controller.js';
import { HrImportService } from './hr-import.service.js';
import { HR_MASTER_PROVIDER, StubHrMasterProvider } from './hr-master-provider.port.js';
import { HttpHrMasterProvider } from './http-hr-master-provider.adapter.js';
import { IntegrationsController } from './integrations.controller.js';
import { TerminalGatewayService } from './terminal-gateway.service.js';
import { TerminalIntegrationController } from './terminal-integration.controller.js';
import { TerminalSyncController } from './terminal-sync.controller.js';
import { WebhookDomainService } from './webhook-domain.service.js';

function createHrMasterProvider() {
  return (process.env.HR_PROVIDER_MODE ?? 'stub').toLowerCase() === 'http'
    ? new HttpHrMasterProvider()
    : new StubHrMasterProvider();
}

@Module({
  imports: [AuditModule, PeopleModule, TransactionsModule],
  controllers: [
    HrImportController,
    IntegrationsController,
    TerminalIntegrationController,
    TerminalSyncController,
  ],
  providers: [
    TerminalGatewayService,
    HrImportService,
    WebhookDomainService,
    { provide: HR_MASTER_PROVIDER, useFactory: createHrMasterProvider },
  ],
  exports: [TerminalGatewayService, HrImportService, WebhookDomainService],
})
export class IntegrationsModule {}
