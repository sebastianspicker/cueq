-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'TEAM_LEAD', 'SHIFT_PLANNER', 'HR', 'PAYROLL', 'ADMIN', 'DATA_PROTECTION', 'WORKS_COUNCIL');

-- CreateEnum
CREATE TYPE "WorkTimeModelType" AS ENUM ('FLEXTIME', 'FIXED', 'SHIFT');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('TERMINAL', 'WEB', 'MOBILE', 'IMPORT', 'MANUAL', 'CORRECTION');

-- CreateEnum
CREATE TYPE "TimeTypeCategory" AS ENUM ('WORK', 'PAUSE', 'ON_CALL', 'DEPLOYMENT', 'ERRAND', 'HOME_OFFICE', 'TRAINING', 'TRAVEL');

-- CreateEnum
CREATE TYPE "RosterStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OnCallRotationType" AS ENUM ('WEEKLY', 'DAILY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AbsenceType" AS ENUM ('ANNUAL_LEAVE', 'SICK', 'SPECIAL_LEAVE', 'TRAINING', 'TRAVEL', 'COMP_TIME', 'FLEX_DAY', 'UNPAID', 'PARENTAL');

-- CreateEnum
CREATE TYPE "AbsenceStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkflowType" AS ENUM ('LEAVE_REQUEST', 'BOOKING_CORRECTION', 'SHIFT_SWAP', 'OVERTIME_APPROVAL', 'POST_CLOSE_CORRECTION');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PENDING', 'ESCALATED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClosingStatus" AS ENUM ('OPEN', 'REVIEW', 'CLOSED', 'EXPORTED');

-- CreateEnum
CREATE TYPE "ClosingLockSource" AS ENUM ('AUTO_CUTOFF', 'MANUAL_REVIEW_START', 'HR_CORRECTION');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'FAILED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "persons" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "employmentStartDate" TIMESTAMP(3),
    "employmentEndDate" TIMESTAMP(3),
    "organizationUnitId" TEXT NOT NULL,
    "supervisorId" TEXT,
    "workTimeModelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_units" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_time_models" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WorkTimeModelType" NOT NULL,
    "weeklyHours" DECIMAL(10,2) NOT NULL,
    "dailyTargetHours" DECIMAL(10,2),
    "coreTimeStart" TEXT,
    "coreTimeEnd" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_time_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "timeTypeId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "source" "BookingSource" NOT NULL,
    "note" TEXT,
    "shiftId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "category" "TimeTypeCategory" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_accounts" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "targetHours" DECIMAL(10,2) NOT NULL,
    "actualHours" DECIMAL(10,2) NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL,
    "overtimeHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rosters" (
    "id" TEXT NOT NULL,
    "organizationUnitId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "RosterStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "rosterId" TEXT NOT NULL,
    "personId" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "shiftType" TEXT NOT NULL,
    "minStaffing" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_assignments" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absences" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" "AbsenceType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "days" DECIMAL(10,2) NOT NULL,
    "status" "AbsenceStatus" NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "absences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_adjustments" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "deltaDays" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oncall_rotations" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "organizationUnitId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "rotationType" "OnCallRotationType" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oncall_rotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oncall_deployments" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "rotationId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "remote" BOOLEAN NOT NULL DEFAULT true,
    "ticketReference" TEXT,
    "eventReference" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oncall_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_instances" (
    "id" TEXT NOT NULL,
    "type" "WorkflowType" NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'PENDING',
    "requesterId" TEXT NOT NULL,
    "approverId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT,
    "decisionReason" TEXT,
    "requestPayload" JSONB,
    "delegationTrail" JSONB,
    "submittedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_policies" (
    "id" TEXT NOT NULL,
    "type" "WorkflowType" NOT NULL,
    "escalationDeadlineHours" INTEGER NOT NULL,
    "escalationRoles" JSONB NOT NULL,
    "maxDelegationDepth" INTEGER NOT NULL DEFAULT 5,
    "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_delegation_rules" (
    "id" TEXT NOT NULL,
    "delegatorId" TEXT NOT NULL,
    "delegateId" TEXT NOT NULL,
    "workflowType" "WorkflowType",
    "organizationUnitId" TEXT,
    "activeFrom" TIMESTAMP(3) NOT NULL,
    "activeTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_delegation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "closing_periods" (
    "id" TEXT NOT NULL,
    "organizationUnitId" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "ClosingStatus" NOT NULL DEFAULT 'OPEN',
    "leadApprovedAt" TIMESTAMP(3),
    "leadApprovedById" TEXT,
    "hrApprovedAt" TIMESTAMP(3),
    "hrApprovedById" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockSource" "ClosingLockSource",
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "closing_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_runs" (
    "id" TEXT NOT NULL,
    "closingPeriodId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "artifact" TEXT,
    "contentType" TEXT,
    "exportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exportedById" TEXT NOT NULL,

    CONSTRAINT "export_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_event_outbox" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_event_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secretRef" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "subscribedEvents" TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "outboxEventId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "httpStatus" INTEGER,
    "responseBody" TEXT,
    "error" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminal_devices" (
    "id" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "lastErrorCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminal_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminal_heartbeats" (
    "id" TEXT NOT NULL,
    "terminalDeviceId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "bufferedRecords" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terminal_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminal_sync_batches" (
    "id" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "terminalDeviceId" TEXT,
    "sourceFile" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedById" TEXT,
    "rawPayload" JSONB NOT NULL,
    "resultPayload" JSONB NOT NULL,

    CONSTRAINT "terminal_sync_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_import_runs" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceFile" TEXT,
    "status" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "createdRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB NOT NULL,
    "importedById" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_entries" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "persons_externalId_key" ON "persons"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "persons_email_key" ON "persons"("email");

-- CreateIndex
CREATE INDEX "persons_organizationUnitId_idx" ON "persons"("organizationUnitId");

-- CreateIndex
CREATE INDEX "persons_supervisorId_idx" ON "persons"("supervisorId");

-- CreateIndex
CREATE INDEX "bookings_personId_startTime_idx" ON "bookings"("personId", "startTime");

-- CreateIndex
CREATE INDEX "bookings_timeTypeId_idx" ON "bookings"("timeTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "time_types_code_key" ON "time_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "time_accounts_personId_periodStart_key" ON "time_accounts"("personId", "periodStart");

-- CreateIndex
CREATE INDEX "rosters_organizationUnitId_periodStart_idx" ON "rosters"("organizationUnitId", "periodStart");

-- CreateIndex
CREATE INDEX "shifts_rosterId_idx" ON "shifts"("rosterId");

-- CreateIndex
CREATE INDEX "shift_assignments_personId_shiftId_idx" ON "shift_assignments"("personId", "shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "shift_assignments_shiftId_personId_key" ON "shift_assignments"("shiftId", "personId");

-- CreateIndex
CREATE INDEX "absences_personId_startDate_idx" ON "absences"("personId", "startDate");

-- CreateIndex
CREATE INDEX "leave_adjustments_personId_year_idx" ON "leave_adjustments"("personId", "year");

-- CreateIndex
CREATE INDEX "leave_adjustments_createdBy_createdAt_idx" ON "leave_adjustments"("createdBy", "createdAt");

-- CreateIndex
CREATE INDEX "oncall_rotations_personId_startTime_idx" ON "oncall_rotations"("personId", "startTime");

-- CreateIndex
CREATE INDEX "oncall_rotations_organizationUnitId_startTime_idx" ON "oncall_rotations"("organizationUnitId", "startTime");

-- CreateIndex
CREATE INDEX "oncall_deployments_personId_startTime_idx" ON "oncall_deployments"("personId", "startTime");

-- CreateIndex
CREATE INDEX "oncall_deployments_rotationId_idx" ON "oncall_deployments"("rotationId");

-- CreateIndex
CREATE INDEX "workflow_instances_status_dueAt_idx" ON "workflow_instances"("status", "dueAt");

-- CreateIndex
CREATE INDEX "workflow_instances_type_status_idx" ON "workflow_instances"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_policies_type_key" ON "workflow_policies"("type");

-- CreateIndex
CREATE INDEX "workflow_delegation_rules_delegatorId_isActive_activeFrom_a_idx" ON "workflow_delegation_rules"("delegatorId", "isActive", "activeFrom", "activeTo");

-- CreateIndex
CREATE INDEX "workflow_delegation_rules_workflowType_organizationUnitId_p_idx" ON "workflow_delegation_rules"("workflowType", "organizationUnitId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "closing_periods_organizationUnitId_periodStart_key" ON "closing_periods"("organizationUnitId", "periodStart");

-- CreateIndex
CREATE INDEX "export_runs_closingPeriodId_idx" ON "export_runs"("closingPeriodId");

-- CreateIndex
CREATE INDEX "domain_event_outbox_status_nextAttemptAt_createdAt_idx" ON "domain_event_outbox"("status", "nextAttemptAt", "createdAt");

-- CreateIndex
CREATE INDEX "webhook_endpoints_isActive_idx" ON "webhook_endpoints"("isActive");

-- CreateIndex
CREATE INDEX "webhook_deliveries_outboxEventId_endpointId_attempt_idx" ON "webhook_deliveries"("outboxEventId", "endpointId", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "terminal_devices_terminalId_key" ON "terminal_devices"("terminalId");

-- CreateIndex
CREATE INDEX "terminal_heartbeats_terminalDeviceId_observedAt_idx" ON "terminal_heartbeats"("terminalDeviceId", "observedAt");

-- CreateIndex
CREATE INDEX "terminal_sync_batches_terminalId_importedAt_idx" ON "terminal_sync_batches"("terminalId", "importedAt");

-- CreateIndex
CREATE INDEX "terminal_sync_batches_terminalDeviceId_idx" ON "terminal_sync_batches"("terminalDeviceId");

-- CreateIndex
CREATE INDEX "hr_import_runs_importedAt_idx" ON "hr_import_runs"("importedAt");

-- CreateIndex
CREATE INDEX "audit_entries_entityType_entityId_idx" ON "audit_entries"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_entries_actorId_timestamp_idx" ON "audit_entries"("actorId", "timestamp");

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_organizationUnitId_fkey" FOREIGN KEY ("organizationUnitId") REFERENCES "organization_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_workTimeModelId_fkey" FOREIGN KEY ("workTimeModelId") REFERENCES "work_time_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_units" ADD CONSTRAINT "organization_units_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "organization_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_timeTypeId_fkey" FOREIGN KEY ("timeTypeId") REFERENCES "time_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_accounts" ADD CONSTRAINT "time_accounts_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_organizationUnitId_fkey" FOREIGN KEY ("organizationUnitId") REFERENCES "organization_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "rosters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oncall_rotations" ADD CONSTRAINT "oncall_rotations_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oncall_rotations" ADD CONSTRAINT "oncall_rotations_organizationUnitId_fkey" FOREIGN KEY ("organizationUnitId") REFERENCES "organization_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oncall_deployments" ADD CONSTRAINT "oncall_deployments_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oncall_deployments" ADD CONSTRAINT "oncall_deployments_rotationId_fkey" FOREIGN KEY ("rotationId") REFERENCES "oncall_rotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_runs" ADD CONSTRAINT "export_runs_closingPeriodId_fkey" FOREIGN KEY ("closingPeriodId") REFERENCES "closing_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_outboxEventId_fkey" FOREIGN KEY ("outboxEventId") REFERENCES "domain_event_outbox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "webhook_endpoints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_heartbeats" ADD CONSTRAINT "terminal_heartbeats_terminalDeviceId_fkey" FOREIGN KEY ("terminalDeviceId") REFERENCES "terminal_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_sync_batches" ADD CONSTRAINT "terminal_sync_batches_terminalDeviceId_fkey" FOREIGN KEY ("terminalDeviceId") REFERENCES "terminal_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
