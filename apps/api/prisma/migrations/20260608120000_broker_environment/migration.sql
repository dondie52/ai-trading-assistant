ALTER TABLE "public"."broker_accounts"
ADD COLUMN IF NOT EXISTS "environment" TEXT NOT NULL DEFAULT 'PAPER';
