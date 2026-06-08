ALTER TABLE "sessions"
ADD COLUMN "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "sessions_last_activity_at_idx" ON "sessions"("last_activity_at");
