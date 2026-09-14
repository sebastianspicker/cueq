CREATE TABLE "webhook_dispatch_jobs" (
  "id" TEXT NOT NULL PRIMARY KEY, "activeKey" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "requestedById" TEXT NOT NULL,
  "total" INTEGER NOT NULL, "processed" INTEGER NOT NULL DEFAULT 0,
  "delivered" INTEGER NOT NULL DEFAULT 0, "failed" INTEGER NOT NULL DEFAULT 0,
  "skipped" INTEGER NOT NULL DEFAULT 0, "configurationFaults" INTEGER NOT NULL DEFAULT 0,
  "owner" TEXT, "generation" INTEGER NOT NULL DEFAULT 0, "leaseUntil" TIMESTAMP(3),
  "failureCode" TEXT, "settings" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  CONSTRAINT "webhook_job_status" CHECK ("status" IN ('PENDING', 'RUNNING', 'SUCCEEDED')),
  CONSTRAINT "webhook_job_counters" CHECK ("total" >= "processed" AND "processed" >= 0
    AND "processed" = "delivered" + "failed" + "skipped" + "configurationFaults")
);
CREATE UNIQUE INDEX "webhook_dispatch_jobs_activeKey_key" ON "webhook_dispatch_jobs"("activeKey");
CREATE INDEX "webhook_dispatch_jobs_status_leaseUntil_idx" ON "webhook_dispatch_jobs"("status", "leaseUntil");
CREATE TABLE "webhook_dispatch_job_items" (
  "id" TEXT NOT NULL PRIMARY KEY, "jobId" TEXT NOT NULL REFERENCES "webhook_dispatch_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "eventId" TEXT NOT NULL REFERENCES "domain_event_outbox"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "position" INTEGER NOT NULL, "outcome" TEXT, "completedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "webhook_dispatch_job_items_jobId_eventId_key" ON "webhook_dispatch_job_items"("jobId", "eventId");
CREATE UNIQUE INDEX "webhook_dispatch_job_items_jobId_position_key" ON "webhook_dispatch_job_items"("jobId", "position");
