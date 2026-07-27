-- Persist terminal ingestion identity outside the JSON result payload so exact
-- retries and concurrent imports can be enforced by the database. Historical
-- rows without a checksum remain nullable and are not conflated.
ALTER TABLE "terminal_sync_batches"
ADD COLUMN "ingestionChecksum" TEXT;

UPDATE "terminal_sync_batches"
SET "ingestionChecksum" = "resultPayload" ->> 'ingestionChecksum'
WHERE "resultPayload" ->> 'ingestionChecksum' IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "terminal_sync_batches"
    WHERE "ingestionChecksum" IS NOT NULL
    GROUP BY "terminalId", "ingestionChecksum"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce terminal ingestion idempotency: duplicate terminal/checksum rows exist';
  END IF;
END
$$;

CREATE UNIQUE INDEX "terminal_sync_batches_terminalId_ingestionChecksum_key"
ON "terminal_sync_batches" ("terminalId", "ingestionChecksum");

-- The export API is idempotent for identical period/format/content. Keep that
-- invariant at the storage boundary as a backstop for future writers.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "export_runs"
    GROUP BY "closingPeriodId", "format", "checksum"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce export idempotency: duplicate period/format/checksum rows exist';
  END IF;
END
$$;

CREATE UNIQUE INDEX "export_runs_closingPeriodId_format_checksum_key"
ON "export_runs" ("closingPeriodId", "format", "checksum");
