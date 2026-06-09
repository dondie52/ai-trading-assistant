ALTER TABLE "public"."users"
ADD COLUMN "notification_preferences" JSONB NOT NULL DEFAULT '{"trade": true, "signal": true, "risk": true, "system": true}';
