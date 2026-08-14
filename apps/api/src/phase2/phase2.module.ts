/** Wires Phase 2 API controllers, domain services, adapters, and scheduled jobs. */
import { Module } from '@nestjs/common';
import { PHASE2_CONTROLLERS, PHASE2_EXPORTS, PHASE2_PROVIDERS } from './phase2-module-metadata.js';

/**
 * Consolidated operational API module.
 *
 * The `phase2/` name is historical; ADR-004 keeps workflow, roster, closing,
 * reporting, and integration endpoints together here until a dedicated
 * domain-split refactor can happen without merge churn.
 */
/**
 * Composition root for Phase 2 time, absence, closing, workflow, integration, and reporting capabilities.
 * Providers are intentionally shared so transactional helpers enforce the same invariants across controllers.
 */
@Module({
  providers: PHASE2_PROVIDERS,
  controllers: PHASE2_CONTROLLERS,
  exports: PHASE2_EXPORTS,
})
export class Phase2Module {}
