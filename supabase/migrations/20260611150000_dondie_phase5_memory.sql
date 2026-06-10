CREATE TABLE "public"."dondie_memories" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "run_id" UUID,
    "summary" TEXT NOT NULL,
    "evaluation_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dondie_memories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dondie_memories_agent_id_created_at_idx" ON "public"."dondie_memories"("agent_id", "created_at");

ALTER TABLE "public"."dondie_memories"
    ADD CONSTRAINT "dondie_memories_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "public"."dondie_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."dondie_memories" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."dondie_memories" FROM "anon", "authenticated";
