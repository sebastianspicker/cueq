/** Root NestJS composition boundary; wires infrastructure and feature modules without domain logic. */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthController } from './health/health.controller.js';
import { AuthModule } from './platform/auth/auth.module.js';
import { AbsenceModule } from './modules/absence/public.js';
import { AuditModule } from './modules/audit/public.js';
import { AttendanceModule } from './modules/attendance/public.js';
import { ClosingModule } from './modules/closing/public.js';
import { IntegrationsModule } from './modules/integrations/public.js';
import { PeopleModule } from './modules/people/public.js';
import { PolicyModule } from './modules/policy/public.js';
import { ReportingModule } from './modules/reporting/public.js';
import { SchedulingModule } from './modules/scheduling/public.js';
import { SessionModule } from './modules/session/public.js';
import { WorkflowsModule } from './modules/workflows/public.js';
import { PrismaModule } from './persistence/prisma.module.js';
import { TransactionsModule } from './platform/transactions/transactions.module.js';

/**
 * Root Nest module.
 *
 * Keep infrastructure modules here and compose operational features at their
 * explicit ownership boundaries.
 */
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ScheduleModule.forRoot(),
    AuditModule,
    PeopleModule,
    SessionModule,
    TransactionsModule,
    AttendanceModule,
    AbsenceModule,
    SchedulingModule,
    WorkflowsModule,
    ClosingModule,
    PolicyModule,
    ReportingModule,
    IntegrationsModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
