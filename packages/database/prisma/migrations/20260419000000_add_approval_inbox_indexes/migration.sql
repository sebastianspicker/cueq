-- Add indexes for approval inbox hot paths:
-- Absence status filtering (e.g. "my pending leave requests")
CREATE INDEX IF NOT EXISTS "absences_personId_status_idx" ON "absences" ("personId", "status");

-- WorkflowInstance inbox queries (approver inbox + requester history)
CREATE INDEX IF NOT EXISTS "workflow_instances_approverId_status_idx" ON "workflow_instances" ("approverId", "status");
CREATE INDEX IF NOT EXISTS "workflow_instances_requesterId_status_idx" ON "workflow_instances" ("requesterId", "status");
