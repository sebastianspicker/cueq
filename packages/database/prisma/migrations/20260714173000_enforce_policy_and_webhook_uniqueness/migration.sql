-- Only one current version of each workflow policy may exist. Prisma does not
-- model partial unique indexes, so the storage invariant is declared in SQL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "workflow_policies"
    WHERE "activeTo" IS NULL
    GROUP BY "type"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce workflow policy uniqueness: multiple active versions exist';
  END IF;
END
$$;

CREATE UNIQUE INDEX "workflow_policies_one_active_type_key"
ON "workflow_policies" ("type")
WHERE "activeTo" IS NULL;

-- Time thresholds are global, so exactly zero or one row may be current.
DO $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM "time_threshold_policies"
    WHERE "activeTo" IS NULL
  ) > 1 THEN
    RAISE EXCEPTION
      'Cannot enforce time threshold policy uniqueness: multiple active versions exist';
  END IF;
END
$$;

CREATE UNIQUE INDEX "time_threshold_policies_one_active_key"
ON "time_threshold_policies" ((1))
WHERE "activeTo" IS NULL;

-- A claimed outbox attempt may write at most one result for each endpoint.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "webhook_deliveries"
    GROUP BY "outboxEventId", "endpointId", "attempt"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce webhook delivery uniqueness: duplicate attempt rows exist';
  END IF;
END
$$;

CREATE UNIQUE INDEX "webhook_deliveries_outboxEventId_endpointId_attempt_key"
ON "webhook_deliveries" ("outboxEventId", "endpointId", "attempt");
