-- Phase 6b: two-way push sync — outbox queue + enqueue RPC.
--
-- A local library edit enqueues a push here (via enqueue_anilist_sync). The
-- scheduled sync-push Edge Function drains the queue, writes the change back to
-- AniList (SaveMediaListEntry / DeleteMediaListEntry) with the user's stored
-- token, and either clears the row (success) or backs it off (failure). After
-- MAX_ATTEMPTS the pusher gives up: it drops the row and raises a SYNC_ERROR
-- notification (§6.6, §Phase 6). Local writes always succeed regardless — the
-- queue is best-effort and off the user's critical path.

-- ---------------------------------------------------------------- queue table

create table public.anilist_sync_queue (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  anilist_media_id bigint not null,
  media_type       public.media_type not null,
  operation        text not null default 'upsert'
                   check (operation in ('upsert', 'delete')),
  -- Kept for delete ops: the local row (and its anilist_entry_id) is gone by
  -- the time we push the removal, so we stash the remote entry id here.
  anilist_entry_id bigint,
  attempts         integer not null default 0,
  last_error       text,
  next_attempt_at  timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- One pending push per media per user: rapid edits collapse into a single
  -- row, so the pusher always sends the latest state, not every keystroke.
  unique (user_id, anilist_media_id, media_type)
);

create index anilist_sync_queue_due_idx
  on public.anilist_sync_queue (next_attempt_at);

alter table public.anilist_sync_queue enable row level security;

-- Owner may read their own pending items (drives the "N changes waiting to
-- sync" hint on Settings). All writes go through the definer RPC below or the
-- service-role pusher — no direct client insert/update/delete policies.
create policy "sync_queue_select_own" on public.anilist_sync_queue
  for select using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- enqueue RPC

-- Enqueue a push for the calling user. SECURITY DEFINER so it can (a) confirm
-- the caller has an active, sync-enabled link by reading the service-role-only
-- access_token column, and (b) upsert the queue row without granting the
-- client any write access to the table. A fresh edit resets attempts so a
-- previously-failed item gets another run of the retry ladder.
create or replace function public.enqueue_anilist_sync(
  p_media_id bigint,
  p_media_type public.media_type,
  p_operation text default 'upsert',
  p_anilist_entry_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return;
  end if;
  if p_operation not in ('upsert', 'delete') then
    raise exception 'invalid sync operation: %', p_operation;
  end if;

  -- Only queue when the user actually has a sync-enabled AniList link. Turning
  -- the toggle off (or unlinking) makes every later edit a no-op here.
  if not exists (
    select 1 from public.anilist_connections
     where user_id = v_user
       and sync_enabled
       and access_token is not null
  ) then
    return;
  end if;

  insert into public.anilist_sync_queue as q
    (user_id, anilist_media_id, media_type, operation, anilist_entry_id)
  values (v_user, p_media_id, p_media_type, p_operation, p_anilist_entry_id)
  on conflict (user_id, anilist_media_id, media_type) do update
    set operation        = excluded.operation,
        anilist_entry_id = coalesce(excluded.anilist_entry_id, q.anilist_entry_id),
        attempts         = 0,
        last_error       = null,
        next_attempt_at  = now(),
        updated_at       = now();
end;
$$;

revoke execute on function
  public.enqueue_anilist_sync(bigint, public.media_type, text, bigint)
  from public, anon;
grant execute on function
  public.enqueue_anilist_sync(bigint, public.media_type, text, bigint)
  to authenticated;

-- ------------------------------------------------------------- scheduling
--
-- sync-push runs on the same footing as drop-check — every few minutes,
-- service-role Authorization header. Easiest via the dashboard:
--   Integrations → Cron → New job → Edge Function → sync-push,
--   schedule `*/5 * * * *`, Authorization `Bearer <service role / sb_secret key>`.
-- (pg_cron alternative mirrors the block in 20260715120000_phase5_drop_check.sql.)
