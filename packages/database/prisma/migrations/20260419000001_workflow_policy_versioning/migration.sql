-- Migration: Workflow Policy Versioning
-- Adds activeTo field and replaces the @unique type constraint with
-- @@unique([type, activeFrom]) so multiple historical policy versions
-- can coexist. activeTo = null means the policy is currently active.

-- Add activeTo column (nullable, so all existing rows become active)
ALTER TABLE "workflow_policies" ADD COLUMN "activeTo" TIMESTAMP(3);

-- Drop the old unique index on type
DROP INDEX IF EXISTS "workflow_policies_type_key";

-- Create new composite unique index on (type, activeFrom)
CREATE UNIQUE INDEX "workflow_policies_type_active_from_key"
  ON "workflow_policies"("type", "activeFrom");

-- Create query index on (type, activeTo) for current-policy lookups
CREATE INDEX "workflow_policies_type_active_to_idx"
  ON "workflow_policies"("type", "activeTo");
