CREATE TABLE "public"."dondie_agents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Dondie',
    "tier" TEXT NOT NULL DEFAULT 'FREE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "wallet_balance" DECIMAL(18, 4) NOT NULL DEFAULT 0,
    "strategy_id" UUID,
    "schedule_minutes" INTEGER NOT NULL DEFAULT 60,
    "symbol_universe" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "last_run_at" TIMESTAMP(3),
    "last_evaluation_score" DECIMAL(8, 4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dondie_agents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dondie_agents_user_id_key" UNIQUE ("user_id")
);

CREATE INDEX "dondie_agents_status_idx" ON "public"."dondie_agents"("status");

ALTER TABLE "public"."dondie_agents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."dondie_agents" FROM "anon", "authenticated";
