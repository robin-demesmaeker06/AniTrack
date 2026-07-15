-- Phase 5a: notification inserts for the drop-check job (§6.6).
--
-- The notifications table + notifications_dedupe_idx already exist (Phase 1).
-- That dedupe index is an expression index (payload->>'number'), which
-- PostgREST upserts can't target — so inserts go through this function,
-- where a bare ON CONFLICT DO NOTHING covers any unique violation.

create or replace function public.insert_notifications(p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with ins as (
    insert into public.notifications (user_id, type, anilist_media_id, payload)
    select
      (item ->> 'user_id')::uuid,
      (item ->> 'type')::public.notification_type,
      (item ->> 'anilist_media_id')::bigint,
      coalesce(item -> 'payload', '{}'::jsonb)
    from jsonb_array_elements(p_items) as item
    on conflict do nothing
    returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end;
$$;

-- Service role (the drop-check function) only.
revoke execute on function public.insert_notifications(jsonb)
  from public, anon, authenticated;

-- ------------------------------------------------------------- scheduling
--
-- The drop-check Edge Function must run every 30–60 minutes. Two options:
--
-- (a) Supabase dashboard — Integrations → Cron → New job → type "Edge
--     Function", pick drop-check, schedule `*/30 * * * *`, and set the
--     Authorization header to `Bearer <service role key>`. Easiest; no SQL.
--
-- (b) pg_cron + pg_net, uncomment below and fill in the project ref. Store
--     the service key in Vault first:
--       select vault.create_secret('<service role key>', 'service_role_key');
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.schedule(
--   'drop-check-every-30min',
--   '*/30 * * * *',
--   $cron$
--   select net.http_post(
--     url := 'https://<project-ref>.supabase.co/functions/v1/drop-check',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' ||
--         (select decrypted_secret from vault.decrypted_secrets
--          where name = 'service_role_key')
--     ),
--     body := '{}'::jsonb
--   );
--   $cron$
-- );
