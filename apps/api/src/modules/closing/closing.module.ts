/** Closing, correction, export, and cutoff API surface. */
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public.js';
import { PeopleModule } from '../people/public.js';
import { PolicyModule } from '../policy/public.js';
import { WorkflowRuntimeModule } from '../workflows/workflow-runtime.public.js';
import { TransactionsModule } from '../../platform/transactions/transactions.module.js';
import { ClosingChecklistHelper } from './closing-checklist.helper.js';
import { ClosingCorrectionHelper } from './closing-correction.helper.js';
import { ClosingCutoffService } from './closing-cutoff.service.js';
import { ClosingDomainService } from './closing-domain.service.js';
import { ClosingExportHelper } from './closing-export.helper.js';
import { ClosingLifecycleHelper } from './closing-lifecycle.helper.js';
import { ClosingController } from './closing.controller.js';

@Module({
  imports: [AuditModule, PeopleModule, PolicyModule, TransactionsModule, WorkflowRuntimeModule],
  controllers: [ClosingController],
  providers: [
    ClosingChecklistHelper,
    ClosingCorrectionHelper,
    ClosingCutoffService,
    ClosingDomainService,
    ClosingExportHelper,
    ClosingLifecycleHelper,
  ],
  exports: [ClosingDomainService],
})
export class ClosingModule {}
