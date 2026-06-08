CREATE TABLE "public"."order_status_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "public"."OrderStatus" NOT NULL,
    "metadata_json" JSONB NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_status_events_order_id_occurred_at_idx"
ON "public"."order_status_events"("order_id", "occurred_at");

CREATE INDEX "order_status_events_user_id_idx"
ON "public"."order_status_events"("user_id");

ALTER TABLE "public"."order_status_events"
ADD CONSTRAINT "order_status_events_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
