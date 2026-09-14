BEGIN;

-- CreateEnum
CREATE TYPE "ProfileChangeStatus" AS ENUM ('PENDING_APPROVAL', 'PENDING_SYNC', 'APPLIED', 'CONFLICT', 'REJECTED');

-- CreateTable
CREATE TABLE "hr_source_systems" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownershipProfile" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_source_systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personnel_fields" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "ownerSystemId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "sourceRevision" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personnel_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_hr_records" (
    "id" TEXT NOT NULL,
    "sourceSystemId" TEXT NOT NULL,
    "externalRecordId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_hr_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_change_requests" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "requestedValue" JSONB NOT NULL,
    "expectedRevision" INTEGER NOT NULL,
    "ownerSystemId" TEXT,
    "status" "ProfileChangeStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personnel_change_outbox" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "sourceSystemId" TEXT NOT NULL,
    "status" "ProfileChangeStatus" NOT NULL DEFAULT 'PENDING_SYNC',
    "acknowledgedRevision" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personnel_change_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personnel_relationships" (
    "id" TEXT NOT NULL,
    "subjectPersonId" TEXT NOT NULL,
    "relatedPersonId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personnel_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hr_source_systems_code_key" ON "hr_source_systems"("code");

-- CreateIndex
CREATE INDEX "personnel_fields_personId_createdAt_id_idx" ON "personnel_fields"("personId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "personnel_fields_personId_key_key" ON "personnel_fields"("personId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "external_hr_records_sourceSystemId_externalRecordId_key" ON "external_hr_records"("sourceSystemId", "externalRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "external_hr_records_sourceSystemId_personId_key" ON "external_hr_records"("sourceSystemId", "personId");

-- CreateIndex
CREATE INDEX "profile_change_requests_personId_createdAt_id_idx" ON "profile_change_requests"("personId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "profile_change_requests_status_createdAt_id_idx" ON "profile_change_requests"("status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "personnel_change_outbox_requestId_key" ON "personnel_change_outbox"("requestId");

-- CreateIndex
CREATE INDEX "personnel_change_outbox_sourceSystemId_createdAt_id_idx" ON "personnel_change_outbox"("sourceSystemId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "personnel_relationships_subjectPersonId_createdAt_id_idx" ON "personnel_relationships"("subjectPersonId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "personnel_fields" ADD CONSTRAINT "personnel_fields_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel_fields" ADD CONSTRAINT "personnel_fields_ownerSystemId_fkey" FOREIGN KEY ("ownerSystemId") REFERENCES "hr_source_systems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_hr_records" ADD CONSTRAINT "external_hr_records_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "hr_source_systems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_hr_records" ADD CONSTRAINT "external_hr_records_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_change_requests" ADD CONSTRAINT "profile_change_requests_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_change_requests" ADD CONSTRAINT "profile_change_requests_ownerSystemId_fkey" FOREIGN KEY ("ownerSystemId") REFERENCES "hr_source_systems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel_change_outbox" ADD CONSTRAINT "personnel_change_outbox_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "profile_change_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel_change_outbox" ADD CONSTRAINT "personnel_change_outbox_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "hr_source_systems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel_relationships" ADD CONSTRAINT "personnel_relationships_subjectPersonId_fkey" FOREIGN KEY ("subjectPersonId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel_relationships" ADD CONSTRAINT "personnel_relationships_relatedPersonId_fkey" FOREIGN KEY ("relatedPersonId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Keep ownership and pending changes explicit even for direct database writers.
ALTER TABLE "personnel_fields" ADD CONSTRAINT "personnel_field_revision_positive" CHECK ("revision" > 0);
ALTER TABLE "personnel_fields" ADD CONSTRAINT "personnel_field_key" CHECK ("key" IN ('firstName', 'lastName', 'preferredName', 'phone', 'address', 'emergencyContact'));
ALTER TABLE "profile_change_requests" ADD CONSTRAINT "profile_change_revision_nonnegative" CHECK ("expectedRevision" >= 0);
CREATE UNIQUE INDEX "profile_change_one_pending_field" ON "profile_change_requests" ("personId", "fieldKey") WHERE "status" IN ('PENDING_APPROVAL', 'PENDING_SYNC');
ALTER TABLE "personnel_relationships" ADD CONSTRAINT "personnel_relationship_interval" CHECK ("subjectPersonId" <> "relatedPersonId" AND ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"));
COMMIT;
