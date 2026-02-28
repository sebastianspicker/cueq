import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';

/**
 * Root application module.
 *
 * Feature modules will be added here as they are implemented:
 * - BookingsModule (Phase 1)
 * - AbsencesModule (Phase 1)
 * - RosterModule (Phase 1)
 * - WorkflowsModule (Phase 1)
 * - ClosingModule (Phase 2)
 * - AuthModule (Phase 2)
 */
@Module({
  imports: [],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
