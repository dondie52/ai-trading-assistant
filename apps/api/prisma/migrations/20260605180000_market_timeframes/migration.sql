-- AlterTable
ALTER TABLE "public"."market_prices" ADD COLUMN "timeframe" TEXT NOT NULL DEFAULT '1m';

-- DropIndex
DROP INDEX IF EXISTS "public"."market_prices_symbol_timestamp_key";

-- CreateIndex
CREATE UNIQUE INDEX "market_prices_symbol_timeframe_timestamp_key" ON "public"."market_prices"("symbol", "timeframe", "timestamp");
