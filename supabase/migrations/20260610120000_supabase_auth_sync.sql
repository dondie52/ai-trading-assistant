-- Supabase Auth integration: sync auth.users to public.users and security columns.

ALTER TABLE "public"."users"
  ALTER COLUMN "password_hash" DROP NOT NULL;

ALTER TABLE "public"."users"
  ADD COLUMN IF NOT EXISTS "provisioned_by" UUID,
  ADD COLUMN IF NOT EXISTS "mfa_grace_until" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app_role text;
  first_name text;
  last_name text;
BEGIN
  app_role := COALESCE(new.raw_app_meta_data ->> 'platform_role', 'TRADER');
  IF app_role NOT IN ('TRADER', 'ADMIN') THEN
    app_role := 'TRADER';
  END IF;

  first_name := COALESCE(NULLIF(new.raw_user_meta_data ->> 'first_name', ''), 'Platform');
  last_name := COALESCE(NULLIF(new.raw_user_meta_data ->> 'last_name', ''), 'User');

  INSERT INTO public.users (
    id,
    email,
    password_hash,
    first_name,
    last_name,
    role,
    status,
    mfa_enabled,
    notification_preferences,
    provisioned_by,
    mfa_grace_until,
    must_change_password,
    created_at,
    updated_at
  )
  VALUES (
    new.id,
    lower(new.email),
    NULL,
    first_name,
    last_name,
    app_role::"public"."UserRole",
    'ACTIVE',
    false,
    '{"trade":true,"signal":true,"risk":true,"system":true}'::jsonb,
    NULLIF(new.raw_app_meta_data ->> 'provisioned_by', '')::uuid,
    COALESCE(
      (new.raw_app_meta_data ->> 'mfa_grace_until')::timestamptz,
      now() + interval '7 days'
    ),
    COALESCE((new.raw_app_meta_data ->> 'must_change_password')::boolean, true),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    role = EXCLUDED.role,
    updated_at = now();

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- Custom access token hook: inject platform role from public.users (not user_metadata).
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  platform_role text;
BEGIN
  SELECT role::text
  INTO platform_role
  FROM public.users
  WHERE id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';

  IF platform_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{platform_role}', to_jsonb(platform_role));
  ELSE
    claims := jsonb_set(claims, '{platform_role}', '"TRADER"');
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
