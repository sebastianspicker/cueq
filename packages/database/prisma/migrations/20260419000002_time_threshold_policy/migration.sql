-- CreateTable: time_threshold_policies
-- Stores versioned ArbZG working-time thresholds (daily max, minimum rest period).
-- The active policy is the row where active_to IS NULL.

CREATE TABLE "time_threshold_policies" (
    "id"               TEXT        NOT NULL,
    "dailyMaxMinutes"  INTEGER     NOT NULL DEFAULT 600,
    "minRestMinutes"   INTEGER     NOT NULL DEFAULT 660,
    "activeFrom"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeTo"         TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_threshold_policies_pkey" PRIMARY KEY ("id")
);

-- Index to efficiently locate the currently active policy
CREATE INDEX "time_threshold_policies_activeTo_idx" ON "time_threshold_policies"("activeTo");

-- Seed the statutory ArbZG defaults as the initial active policy
INSERT INTO "time_threshold_policies" ("id", "dailyMaxMinutes", "minRestMinutes", "activeFrom", "activeTo", "createdAt", "updatedAt")
VALUES ('default-arbzg', 600, 660, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
