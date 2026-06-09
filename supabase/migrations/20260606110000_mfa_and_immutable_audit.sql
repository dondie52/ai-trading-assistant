ALTER TABLE "public"."users"
ADD COLUMN "mfa_secret_encrypted" TEXT;

CREATE OR REPLACE FUNCTION "public"."reject_audit_log_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are append-only';
END;
$$;

CREATE TRIGGER "audit_logs_immutable"
BEFORE UPDATE OR DELETE ON "public"."audit_logs"
FOR EACH ROW
EXECUTE FUNCTION "public"."reject_audit_log_mutation"();
