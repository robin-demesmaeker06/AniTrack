-- Phase 5b/5c follow-up (2026-07-15):
--   1. Real per-episode runtime for the Stats "days watched" figure.
--   2. Index to make the News page's "My series" filter cheap.
--
-- news_items itself was already scaffolded in Phase 1 (init.sql) — nothing
-- to create there, just an index. The news-fetch and series-news Edge
-- Functions write into it (service role bypasses RLS; the existing
-- "news_public_read" policy already covers client reads).

-- ---------------------------------------------------------------- duration

-- AniList's per-episode runtime, minutes. Nullable: AniList itself doesn't
-- always have it (movies/specials vary), and older cache rows won't have it
-- until their next refresh (TTL churn or a manual revisit). Stats blends
-- known durations with a labeled estimate for anything still null — see
-- src/features/stats/stats.ts.
alter table public.media_cache add column duration integer;

-- ---------------------------------------------------------------- news_items

-- "My series" filter on the News page looks up by this column; the table
-- is small but this keeps it an index scan instead of a seq scan as it grows.
create index news_items_related_media_idx
  on public.news_items (related_anilist_media_id)
  where related_anilist_media_id is not null;

-- ------------------------------------------------------------- scheduling
--
-- news-fetch (RSS aggregation, §6.7) needs the same treatment as drop-check:
-- run every 30–60 minutes, service-role only.
--
-- (a) Supabase dashboard — Integrations → Cron → New job → type "Edge
--     Function", pick news-fetch, schedule `*/30 * * * *`, Authorization
--     header `Bearer <service role key>`.
--
-- (b) pg_cron + pg_net, uncomment below (needs the vault secret from the
--     phase5_drop_check migration already set up, or create it now):
--
-- select cron.schedule(
--   'news-fetch-every-30min',
--   '*/30 * * * *',
--   $cron$
--   select net.http_post(
--     url := 'https://<project-ref>.supabase.co/functions/v1/news-fetch',
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
--
-- series-news (Jikan per-series news) is NOT scheduled — it's invoked
-- on-demand by authenticated users from the media detail page (functions.
-- invoke, rate-limited via bump_rate_limit like the anilist function), so
-- it needs no cron entry.
