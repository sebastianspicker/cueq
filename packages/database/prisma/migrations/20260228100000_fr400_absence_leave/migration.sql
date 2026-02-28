-- FR-400: absence & leave foundation
-- Adds employment window metadata and leave adjustment ledger.

ALTER TABLE "persons"
  ADD COLUMN "employmentStartDate" TIMESTAMP(3),
  ADD COLUMN "employmentEndDate" TIMESTAMP(3);

CREATE TABLE "leave_adjustments" (
  "id" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "deltaDays" DECIMAL(65,30) NOT NULL,
  "reason" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leave_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leave_adjustments_personId_year_idx" ON "leave_adjustments"("personId", "year");
CREATE INDEX "leave_adjustments_createdBy_createdAt_idx" ON "leave_adjustments"("createdBy", "createdAt");

ALTER TABLE "leave_adjustments"
  ADD CONSTRAINT "leave_adjustments_personId_fkey"
  FOREIGN KEY ("personId")
  REFERENCES "persons"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
