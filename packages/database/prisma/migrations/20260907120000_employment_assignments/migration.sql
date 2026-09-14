BEGIN;

-- Do not guess an employee from the actor who requested a workflow.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM "workflow_instances" w WHERE NOT (
      (w."entityType" = 'Booking' AND EXISTS (SELECT 1 FROM "bookings" b WHERE b.id = w."entityId")) OR
      (w."entityType" = 'Absence' AND EXISTS (SELECT 1 FROM "absences" a WHERE a.id = w."entityId")) OR
      (w."entityType" = 'TimeAccount' AND EXISTS (SELECT 1 FROM "time_accounts" a WHERE a.id = w."entityId")) OR
      (w."entityType" = 'Shift' AND EXISTS (SELECT 1 FROM "shifts" s WHERE s.id = w."entityId") AND EXISTS (SELECT 1 FROM "persons" p WHERE p.id = w."requestPayload"->>'fromPersonId')) OR
      (w."entityType" = 'ClosingPeriod' AND w.type = 'POST_CLOSE_CORRECTION' AND EXISTS (SELECT 1 FROM "closing_periods" c WHERE c.id = w."entityId"))
    )
  ) THEN RAISE EXCEPTION 'Employment backfill preflight: unresolved workflow subject; reconcile affected aggregates before retrying'; END IF;
END $$;

-- DropIndex
DROP INDEX "time_accounts_personId_periodStart_key";

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "assignmentId" TEXT;

-- AlterTable
ALTER TABLE "time_accounts" ADD COLUMN     "assignmentId" TEXT;

-- AlterTable
ALTER TABLE "shift_assignments" ADD COLUMN     "assignmentId" TEXT;

-- AlterTable
ALTER TABLE "absences" ADD COLUMN     "assignmentId" TEXT;

-- AlterTable
ALTER TABLE "leave_adjustments" ADD COLUMN     "assignmentId" TEXT;

-- AlterTable
ALTER TABLE "oncall_rotations" ADD COLUMN     "assignmentId" TEXT;

-- AlterTable
ALTER TABLE "oncall_deployments" ADD COLUMN     "assignmentId" TEXT;

-- AlterTable
ALTER TABLE "workflow_instances" ADD COLUMN     "assignmentId" TEXT;

-- CreateTable
CREATE TABLE "employment_assignments" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "externalAppointmentId" TEXT,
    "label" TEXT NOT NULL,
    "legacy" BOOLEAN NOT NULL DEFAULT false,
    "employmentStartDate" TIMESTAMP(3),
    "employmentEndDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employment_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_terms" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "organizationUnitId" TEXT NOT NULL,
    "supervisorId" TEXT,
    "workTimeModelId" TEXT,
    "weeklyHours" DECIMAL(10,2),
    "dailyTargetHours" DECIMAL(10,2),
    "workingDays" INTEGER[] NOT NULL,
    "employmentGroupId" TEXT NOT NULL,
    "holidayCalendarId" TEXT NOT NULL,
    "policyReferences" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employment_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_groups" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "legacyReference" BOOLEAN NOT NULL DEFAULT false,
    "leavePolicy" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employment_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holiday_calendars" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "holidayDates" TEXT[] NOT NULL,
    "legacyReference" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holiday_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capability_grants" (
    "id" TEXT NOT NULL,
    "granteeId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "targetId" TEXT,
    "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeTo" TIMESTAMP(3),
    "grantedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capability_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employment_assignments_personId_createdAt_id_idx" ON "employment_assignments"("personId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "employment_assignments_id_personId_key" ON "employment_assignments"("id", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "employment_assignments_sourceSystem_externalAppointmentId_key" ON "employment_assignments"("sourceSystem", "externalAppointmentId");

-- CreateIndex
CREATE INDEX "employment_terms_assignmentId_effectiveFrom_id_idx" ON "employment_terms"("assignmentId", "effectiveFrom", "id");

-- CreateIndex
CREATE INDEX "employment_terms_organizationUnitId_effectiveFrom_idx" ON "employment_terms"("organizationUnitId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "employment_groups_code_version_key" ON "employment_groups"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "holiday_calendars_code_version_key" ON "holiday_calendars"("code", "version");

-- CreateIndex
CREATE INDEX "capability_grants_granteeId_capability_revokedAt_idx" ON "capability_grants"("granteeId", "capability", "revokedAt");

-- CreateIndex
CREATE INDEX "bookings_assignmentId_startTime_id_idx" ON "bookings"("assignmentId", "startTime", "id");

-- CreateIndex
CREATE INDEX "time_accounts_personId_periodStart_idx" ON "time_accounts"("personId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "time_accounts_assignmentId_periodStart_key" ON "time_accounts"("assignmentId", "periodStart");

-- CreateIndex
CREATE INDEX "shift_assignments_assignmentId_shiftId_idx" ON "shift_assignments"("assignmentId", "shiftId");

-- CreateIndex
CREATE INDEX "absences_assignmentId_startDate_id_idx" ON "absences"("assignmentId", "startDate", "id");

-- CreateIndex
CREATE INDEX "leave_adjustments_assignmentId_year_id_idx" ON "leave_adjustments"("assignmentId", "year", "id");

-- CreateIndex
CREATE INDEX "oncall_rotations_assignmentId_startTime_id_idx" ON "oncall_rotations"("assignmentId", "startTime", "id");

-- CreateIndex
CREATE INDEX "oncall_deployments_assignmentId_startTime_id_idx" ON "oncall_deployments"("assignmentId", "startTime", "id");

-- CreateIndex
CREATE INDEX "workflow_instances_assignmentId_createdAt_id_idx" ON "workflow_instances"("assignmentId", "createdAt", "id");

-- Identifiable legacy/reference configuration; this does not approve new institutional rules.
INSERT INTO "employment_groups" (id, code, version, name, "legacyReference", "leavePolicy") VALUES ('cd98873a4d3da5b3a0370703a', 'LEGACY_UNSPECIFIED', 1, 'Legacy TV-L reference configuration', true, '{"id": "leave-tvl-default", "name": "TV-L §26 Annual Leave", "description": "30 days annual leave for 5-day week, carry-over until March 31", "version": 1, "effectiveFrom": "2024-01-01", "effectiveTo": null, "createdAt": "2026-01-01T00:00:00.000Z", "createdBy": "system", "type": "LEAVE_RULE", "annualEntitlementDays": 30, "fullTimeWeeklyHours": 39.83, "workDaysPerWeek": 5, "proRataOnEntry": true, "proRataOnExit": true, "carryOver": {"enabled": true, "maxDays": 30, "forfeitureDeadline": "03-31"}}'::jsonb);
INSERT INTO "holiday_calendars" (id, code, version, name, "holidayDates", "legacyReference") VALUES ('ce1c57004d19635e7cd5ada1d', 'LEGACY_NRW_2026', 1, 'Legacy curated NRW calendar', ARRAY['2026-01-01','2026-04-03','2026-04-06','2026-05-01','2026-05-14','2026-05-25','2026-06-04','2026-10-03','2026-11-01','2026-12-25','2026-12-26']::text[], true);
INSERT INTO "employment_assignments" (id, "personId", "sourceSystem", "externalAppointmentId", label, legacy, "employmentStartDate", "employmentEndDate", "createdAt", "updatedAt")
SELECT 'c' || substr(md5('cueq:assignment:' || id), 1, 24), id, 'legacy-hr', id, 'Legacy appointment', true, "employmentStartDate", "employmentEndDate", "createdAt", "updatedAt" FROM "persons";
INSERT INTO "employment_terms" (id, "assignmentId", "effectiveFrom", "effectiveTo", "organizationUnitId", "supervisorId", "workTimeModelId", "weeklyHours", "dailyTargetHours", "workingDays", "employmentGroupId", "holidayCalendarId", "policyReferences", "createdAt")
SELECT 'c' || substr(md5('cueq:term:' || p.id), 1, 24), a.id, NULL, NULL, p."organizationUnitId", p."supervisorId", p."workTimeModelId", m."weeklyHours", m."dailyTargetHours", ARRAY[1,2,3,4,5], 'cd98873a4d3da5b3a0370703a', 'ce1c57004d19635e7cd5ada1d', '{"leave":"leave-tvl-default@1","origin":"legacy-reference"}'::jsonb, p."createdAt"
FROM "persons" p JOIN "employment_assignments" a ON a."personId" = p.id LEFT JOIN "work_time_models" m ON m.id = p."workTimeModelId";
UPDATE "bookings" r SET "assignmentId" = a.id FROM "employment_assignments" a WHERE a."personId" = r."personId";
UPDATE "absences" r SET "assignmentId" = a.id FROM "employment_assignments" a WHERE a."personId" = r."personId";
UPDATE "leave_adjustments" r SET "assignmentId" = a.id FROM "employment_assignments" a WHERE a."personId" = r."personId";
UPDATE "time_accounts" r SET "assignmentId" = a.id FROM "employment_assignments" a WHERE a."personId" = r."personId";
UPDATE "shift_assignments" r SET "assignmentId" = a.id FROM "employment_assignments" a WHERE a."personId" = r."personId";
UPDATE "oncall_rotations" r SET "assignmentId" = a.id FROM "employment_assignments" a WHERE a."personId" = r."personId";
UPDATE "oncall_deployments" r SET "assignmentId" = a.id FROM "employment_assignments" a WHERE a."personId" = r."personId";
UPDATE "workflow_instances" w SET "assignmentId" = r."assignmentId" FROM "bookings" r WHERE w."entityType" = 'Booking' AND r.id = w."entityId";
UPDATE "workflow_instances" w SET "assignmentId" = r."assignmentId" FROM "absences" r WHERE w."entityType" = 'Absence' AND r.id = w."entityId";
UPDATE "workflow_instances" w SET "assignmentId" = r."assignmentId" FROM "time_accounts" r WHERE w."entityType" = 'TimeAccount' AND r.id = w."entityId";
UPDATE "workflow_instances" w SET "assignmentId" = a.id FROM "employment_assignments" a WHERE w."entityType" = 'Shift' AND a."personId" = w."requestPayload"->>'fromPersonId';
-- ClosingPeriod workflows retain organization scope and deliberately have no appointment.
ALTER TABLE "bookings" ALTER COLUMN "assignmentId" SET NOT NULL;
ALTER TABLE "absences" ALTER COLUMN "assignmentId" SET NOT NULL;
ALTER TABLE "leave_adjustments" ALTER COLUMN "assignmentId" SET NOT NULL;
ALTER TABLE "time_accounts" ALTER COLUMN "assignmentId" SET NOT NULL;
ALTER TABLE "shift_assignments" ALTER COLUMN "assignmentId" SET NOT NULL;
ALTER TABLE "oncall_rotations" ALTER COLUMN "assignmentId" SET NOT NULL;
ALTER TABLE "oncall_deployments" ALTER COLUMN "assignmentId" SET NOT NULL;
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_assignment_scope" CHECK (("entityType" = 'ClosingPeriod' AND "type" = 'POST_CLOSE_CORRECTION' AND "assignmentId" IS NULL) OR ("entityType" <> 'ClosingPeriod' AND "assignmentId" IS NOT NULL));
ALTER TABLE "employment_assignments" ADD CONSTRAINT "employment_date_order" CHECK ("employmentStartDate" IS NULL OR "employmentEndDate" IS NULL OR "employmentStartDate" <= "employmentEndDate");
ALTER TABLE "employment_terms" ADD CONSTRAINT "employment_term_order" CHECK ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveFrom" < "effectiveTo");
ALTER TABLE "employment_terms" ADD CONSTRAINT "employment_term_weekdays" CHECK (cardinality("workingDays") BETWEEN 1 AND 7 AND "workingDays" <@ ARRAY[1,2,3,4,5,6,7]);
ALTER TABLE "capability_grants" ADD CONSTRAINT "capability_scope_target" CHECK ((scope IN ('SELF','GLOBAL') AND "targetId" IS NULL) OR (scope IN ('PERSON','ORGANIZATION','PROJECT') AND "targetId" IS NOT NULL));
ALTER TABLE "capability_grants" ADD CONSTRAINT "capability_grant_interval" CHECK ("activeTo" IS NULL OR "activeTo" > "activeFrom");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_assignmentId_personId_fkey" FOREIGN KEY ("assignmentId", "personId") REFERENCES "employment_assignments"("id", "personId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_accounts" ADD CONSTRAINT "time_accounts_assignmentId_personId_fkey" FOREIGN KEY ("assignmentId", "personId") REFERENCES "employment_assignments"("id", "personId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_assignmentId_personId_fkey" FOREIGN KEY ("assignmentId", "personId") REFERENCES "employment_assignments"("id", "personId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_assignmentId_personId_fkey" FOREIGN KEY ("assignmentId", "personId") REFERENCES "employment_assignments"("id", "personId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_assignmentId_personId_fkey" FOREIGN KEY ("assignmentId", "personId") REFERENCES "employment_assignments"("id", "personId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oncall_rotations" ADD CONSTRAINT "oncall_rotations_assignmentId_personId_fkey" FOREIGN KEY ("assignmentId", "personId") REFERENCES "employment_assignments"("id", "personId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oncall_deployments" ADD CONSTRAINT "oncall_deployments_assignmentId_personId_fkey" FOREIGN KEY ("assignmentId", "personId") REFERENCES "employment_assignments"("id", "personId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "employment_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_assignments" ADD CONSTRAINT "employment_assignments_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_terms" ADD CONSTRAINT "employment_terms_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "employment_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_terms" ADD CONSTRAINT "employment_terms_organizationUnitId_fkey" FOREIGN KEY ("organizationUnitId") REFERENCES "organization_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_terms" ADD CONSTRAINT "employment_terms_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_terms" ADD CONSTRAINT "employment_terms_workTimeModelId_fkey" FOREIGN KEY ("workTimeModelId") REFERENCES "work_time_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_terms" ADD CONSTRAINT "employment_terms_employmentGroupId_fkey" FOREIGN KEY ("employmentGroupId") REFERENCES "employment_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_terms" ADD CONSTRAINT "employment_terms_holidayCalendarId_fkey" FOREIGN KEY ("holidayCalendarId") REFERENCES "holiday_calendars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capability_grants" ADD CONSTRAINT "capability_grants_granteeId_fkey" FOREIGN KEY ("granteeId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE UNIQUE INDEX "oncall_rotations_id_assignmentId_personId_key" ON "oncall_rotations"("id", "assignmentId", "personId");
ALTER TABLE "oncall_deployments" DROP CONSTRAINT "oncall_deployments_rotationId_fkey";
ALTER TABLE "oncall_deployments" ADD CONSTRAINT "oncall_deployments_rotationId_assignmentId_personId_fkey" FOREIGN KEY ("rotationId", "assignmentId", "personId") REFERENCES "oncall_rotations"("id", "assignmentId", "personId") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
