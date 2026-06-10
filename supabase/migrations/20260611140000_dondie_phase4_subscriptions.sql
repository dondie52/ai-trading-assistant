CREATE TABLE "public"."dondie_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "monthly_price_usd" DECIMAL(18, 4) NOT NULL,
    "external_id" TEXT,
    "revenue_credited" DECIMAL(18, 4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dondie_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dondie_subscriptions_user_id_idx" ON "public"."dondie_subscriptions"("user_id");
CREATE INDEX "dondie_subscriptions_agent_id_idx" ON "public"."dondie_subscriptions"("agent_id");

ALTER TABLE "public"."dondie_subscriptions"
    ADD CONSTRAINT "dondie_subscriptions_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "public"."dondie_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."dondie_subscriptions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."dondie_subscriptions" FROM "anon", "authenticated";
