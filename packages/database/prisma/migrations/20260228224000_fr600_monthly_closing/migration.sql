-- FR-600 Monthly Closing: approval metadata + lock metadata

CREATE TYPE "ClosingLockSource" AS ENUM ('AUTO_CUTOFF', 'MANUAL_REVIEW_START', 'HR_CORRECTION');

ALTER TABLE "closing_periods"
ADD COLUMN "leadApprovedAt" TIMESTAMP(3),
ADD COLUMN "leadApprovedById" TEXT,
ADD COLUMN "hrApprovedAt" TIMESTAMP(3),
ADD COLUMN "hrApprovedById" TEXT,
ADD COLUMN "lockedAt" TIMESTAMP(3),
ADD COLUMN "lockSource" "ClosingLockSource";
