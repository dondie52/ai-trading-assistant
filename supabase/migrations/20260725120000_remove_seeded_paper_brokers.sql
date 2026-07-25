-- Production cleanup: drop unused auto-seeded PAPER broker rows.
-- Pattern matches account ids created by ensureDefaultAccountState / prisma seed
-- (`paper-{first 8 chars of user id}`). Rows with orders are kept for history.

DELETE FROM public.broker_accounts AS ba
WHERE ba.broker_name = 'PAPER'
  AND ba.encrypted_api_key IS NULL
  AND ba.encrypted_secret IS NULL
  AND ba.account_id LIKE 'paper-%'
  AND NOT EXISTS (
    SELECT 1
    FROM public.orders AS o
    WHERE o.broker_account_id = ba.id
  );
