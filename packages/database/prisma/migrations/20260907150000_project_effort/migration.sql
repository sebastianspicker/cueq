BEGIN;

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "organizationUnitId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "costCentre" TEXT,
    "fundingReference" TEXT,
    "budgetHours" DECIMAL(12,2),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_memberships" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_time_allocations" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_time_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE INDEX "projects_createdAt_id_idx" ON "projects"("createdAt", "id");

-- CreateIndex
CREATE INDEX "project_memberships_projectId_createdAt_id_idx" ON "project_memberships"("projectId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "project_memberships_assignmentId_projectId_effectiveFrom_idx" ON "project_memberships"("assignmentId", "projectId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "project_time_allocations_assignmentId_createdAt_id_idx" ON "project_time_allocations"("assignmentId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "project_time_allocations_projectId_createdAt_id_idx" ON "project_time_allocations"("projectId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "project_time_allocations_bookingId_projectId_key" ON "project_time_allocations"("bookingId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_id_assignmentId_personId_key" ON "bookings"("id", "assignmentId", "personId");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organizationUnitId_fkey" FOREIGN KEY ("organizationUnitId") REFERENCES "organization_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_assignmentId_personId_fkey" FOREIGN KEY ("assignmentId", "personId") REFERENCES "employment_assignments"("id", "personId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_time_allocations" ADD CONSTRAINT "project_time_allocations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_time_allocations" ADD CONSTRAINT "project_time_allocations_bookingId_assignmentId_personId_fkey" FOREIGN KEY ("bookingId", "assignmentId", "personId") REFERENCES "bookings"("id", "assignmentId", "personId") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE projects ADD CONSTRAINT project_budget_nonnegative CHECK ("budgetHours" IS NULL OR "budgetHours" >= 0);
ALTER TABLE project_memberships ADD CONSTRAINT project_membership_interval CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");
ALTER TABLE project_time_allocations ADD CONSTRAINT project_minutes_nonnegative CHECK (minutes >= 0);

-- Serialize all effort writes with their source booking, including raw imports.
CREATE FUNCTION cueq_check_project_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_booking bookings%ROWTYPE; allocated bigint; category "TimeTypeCategory";
BEGIN
  SELECT * INTO source_booking FROM bookings WHERE id = NEW."bookingId" FOR UPDATE;
  SELECT t.category INTO category FROM time_types t WHERE t.id = source_booking."timeTypeId";
  SELECT COALESCE(SUM(minutes), 0) INTO allocated FROM project_time_allocations WHERE "bookingId" = NEW."bookingId";
  IF source_booking."endTime" IS NULL OR category IN ('PAUSE', 'ON_CALL')
     OR allocated > FLOOR(EXTRACT(EPOCH FROM (source_booking."endTime" - source_booking."startTime")) / 60) THEN
    RAISE EXCEPTION 'Project allocation exceeds allocatable attendance' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER project_allocation_duration AFTER INSERT OR UPDATE ON project_time_allocations
FOR EACH ROW EXECUTE FUNCTION cueq_check_project_allocation();

CREATE FUNCTION cueq_check_allocated_booking() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allocated bigint; category "TimeTypeCategory";
BEGIN
  SELECT COALESCE(SUM(minutes), 0) INTO allocated FROM project_time_allocations WHERE "bookingId" = NEW.id;
  IF allocated = 0 THEN RETURN NEW; END IF;
  SELECT t.category INTO category FROM time_types t WHERE t.id = NEW."timeTypeId";
  IF NEW."endTime" IS NULL OR category IN ('PAUSE', 'ON_CALL')
     OR allocated > FLOOR(EXTRACT(EPOCH FROM (NEW."endTime" - NEW."startTime")) / 60) THEN
    RAISE EXCEPTION 'Booking correction invalidates project allocations' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER booking_project_allocation_duration BEFORE UPDATE ON bookings
FOR EACH ROW EXECUTE FUNCTION cueq_check_allocated_booking();
COMMIT;
