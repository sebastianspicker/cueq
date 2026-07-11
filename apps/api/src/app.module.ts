import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthController } from './health/health.controller';
import { AuthModule } from './common/auth/auth.module';
import { PrismaModule } from './persistence/prisma.module';
import { Phase2Module } from './phase2/phase2.module';

/**
 * Root Nest module.
 *
 * Keep infrastructure modules here and route the current operational surface
 * through Phase2Module until ADR-004's domain-split rename is executed.
 */
@Module({
  imports: [PrismaModule, AuthModule, ScheduleModule.forRoot(), Phase2Module],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
