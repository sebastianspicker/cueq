-- Backfill the former single-assignee column into the authoritative join table.
-- The derived IDs are deterministic, valid CUID-shaped values, so rerunning this
-- statement preserves existing rows and creates at most one row per pair.
INSERT INTO "shift_assignments" ("id", "shiftId", "personId", "createdAt", "updatedAt")
SELECT
  'c' || substring(md5("shifts"."id" || ':' || "shifts"."personId") FROM 1 FOR 24),
  "shifts"."id",
  "shifts"."personId",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "shifts"
WHERE "shifts"."personId" IS NOT NULL
ON CONFLICT ("shiftId", "personId") DO NOTHING;

ALTER TABLE "shifts" DROP COLUMN IF EXISTS "personId";
