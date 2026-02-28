import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { AuthModule } from './common/auth/auth.module';
import { PrismaModule } from './persistence/prisma.module';
import { Phase2Module } from './phase2/phase2.module';

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
  imports: [PrismaModule, AuthModule, Phase2Module],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
