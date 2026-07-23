CREATE TABLE "public"."dondie_wallet_ledger" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "entry_type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amount" DECIMAL(18, 4) NOT NULL,
    "balance_after" DECIMAL(18, 4) NOT NULL,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dondie_wallet_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dondie_wallet_ledger_agent_id_created_at_idx" ON "public"."dondie_wallet_ledger"("agent_id", "created_at");

ALTER TABLE "public"."dondie_wallet_ledger"
    ADD CONSTRAINT "dondie_wallet_ledger_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "public"."dondie_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."dondie_wallet_ledger" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."dondie_wallet_ledger" FROM "anon", "authenticated";
