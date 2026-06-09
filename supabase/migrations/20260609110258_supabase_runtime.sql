CREATE TABLE "public"."notification_queue" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_queue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."market_data_cache" (
    "cache_key" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "candles" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_data_cache_pkey" PRIMARY KEY ("cache_key")
);

CREATE INDEX "notification_queue_processed_at_created_at_idx"
ON "public"."notification_queue"("processed_at", "created_at");

CREATE INDEX "notification_queue_user_id_idx"
ON "public"."notification_queue"("user_id");

CREATE INDEX "market_data_cache_expires_at_idx"
ON "public"."market_data_cache"("expires_at");

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."password_reset_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."broker_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."portfolios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."strategies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."signals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."order_status_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."trades" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."positions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."risk_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notification_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."watchlists" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."market_prices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."market_data_cache" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM "anon", "authenticated";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM "anon", "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
REVOKE ALL ON TABLES FROM "anon", "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
REVOKE ALL ON SEQUENCES FROM "anon", "authenticated";
