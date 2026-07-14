-- AniTrack — initial schema (Phase 1)
-- All tables behind RLS, default deny. Policies grant owner-only access;
-- media_cache and news_items are public-read / service-write.

-- ---------------------------------------------------------------- enums

create type public.media_type as enum ('ANIME', 'MANGA');

create type public.entry_status as enum
  ('CURRENT', 'COMPLETED', 'PLANNING', 'PAUSED', 'DROPPED', 'REPEATING');

create type public.activity_action as enum
  ('progress', 'status_change', 'score', 'added');

create type public.notification_type as enum
  ('NEW_EPISODE', 'NEW_CHAPTER', 'SYNC_ERROR');

create type public.title_language as enum ('ENGLISH', 'ROMAJI', 'NATIVE');

create type public.score_format as enum
  ('POINT_10', 'POINT_10_DECIMAL', 'POINT_5');

create type public.theme_pref as enum ('dark', 'light', 'system');

-- ---------------------------------------------------------------- profiles

create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  username       text not null
                 constraint username_format check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  avatar_url     text,
  title_language public.title_language not null default 'ENGLISH',
  score_format   public.score_format not null default 'POINT_10_DECIMAL',
  theme          public.theme_pref not null default 'dark',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index profiles_username_lower_idx on public.profiles (lower(username));

-- ---------------------------------------------------------------- library_entries

create table public.library_entries (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  anilist_media_id bigint not null,
  media_type       public.media_type not null,
  status           public.entry_status not null default 'PLANNING',
  progress         integer not null default 0 check (progress >= 0),
  progress_volumes integer check (progress_volumes >= 0),
  score            integer check (score between 0 and 100),
  notes            text,
  started_at       date,
  finished_at      date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  anilist_entry_id bigint,
  synced_at        timestamptz,
  unique (user_id, anilist_media_id, media_type)
);

create index library_entries_user_status_idx
  on public.library_entries (user_id, status);

-- ---------------------------------------------------------------- media_cache

create table public.media_cache (
  anilist_media_id     bigint not null,
  media_type           public.media_type not null,
  mal_id               integer,
  title_romaji         text,
  title_english        text,
  title_native         text,
  cover_url            text,
  banner_url           text,
  format               text,
  episodes             integer,
  chapters             integer,
  volumes              integer,
  airing_status        text,
  genres               text[] not null default '{}',
  average_score        integer,
  season               text,
  season_year          integer,
  next_airing_episode  integer,
  next_airing_at       timestamptz,
  raw                  jsonb,
  cached_at            timestamptz not null default now(),
  primary key (anilist_media_id, media_type)
);

-- ---------------------------------------------------------------- activity_log

create table public.activity_log (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  action           public.activity_action not null,
  anilist_media_id bigint not null,
  media_type       public.media_type not null,
  detail           jsonb not null default '{}',
  created_at       timestamptz not null default now()
);

create index activity_log_user_created_idx
  on public.activity_log (user_id, created_at desc);

-- ---------------------------------------------------------------- anilist_connections

create table public.anilist_connections (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  anilist_user_id bigint not null,
  -- Written and read only by Edge Functions (service role); encrypted there
  -- before insert (Phase 6). Column-level grants below keep it out of
  -- client reach even for the row owner.
  access_token   text,
  expires_at     timestamptz,
  last_synced_at timestamptz,
  sync_enabled   boolean not null default true,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- notifications

create table public.notifications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  type             public.notification_type not null,
  anilist_media_id bigint,
  payload          jsonb not null default '{}',
  read             boolean not null default false,
  created_at       timestamptz not null default now()
);

create index notifications_user_created_idx
  on public.notifications (user_id, read, created_at desc);

-- Idempotency for the drop-detection job (§6.6): payload carries the episode
-- or chapter number under "number"; re-runs can never double-notify.
create unique index notifications_dedupe_idx
  on public.notifications (user_id, anilist_media_id, type, ((payload ->> 'number')))
  where anilist_media_id is not null;

-- ---------------------------------------------------------------- news_items

create table public.news_items (
  id                       uuid primary key default gen_random_uuid(),
  source                   text not null,
  guid                     text not null,
  title                    text not null,
  url                      text not null,
  excerpt                  text,
  image_url                text,
  published_at             timestamptz,
  related_mal_id           integer,
  related_anilist_media_id bigint,
  media_type               public.media_type,
  fetched_at               timestamptz not null default now(),
  unique (source, guid)
);

create index news_items_published_idx on public.news_items (published_at desc);

-- ---------------------------------------------------------------- triggers

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger library_entries_updated_at
  before update on public.library_entries
  for each row execute function public.set_updated_at();

-- Auto-create a profile on signup. Username comes from the signup form
-- (raw_user_meta_data.username) or falls back to the email prefix; collisions
-- get a random suffix.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  candidate text;
  attempt int := 0;
begin
  base := coalesce(
    new.raw_user_meta_data ->> 'username',
    split_part(new.email, '@', 1)
  );
  base := regexp_replace(base, '[^a-zA-Z0-9_]', '_', 'g');
  base := substr(base, 1, 20);
  if length(base) < 3 then
    base := rpad(base, 3, '0');
  end if;

  candidate := base;
  loop
    begin
      insert into public.profiles (id, username) values (new.id, candidate);
      exit;
    exception when unique_violation then
      attempt := attempt + 1;
      if attempt > 5 then
        candidate := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12);
      else
        candidate := substr(base, 1, 14) || '_' || substr(md5(random()::text), 1, 4);
      end if;
    end;
  end loop;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- RLS

alter table public.profiles            enable row level security;
alter table public.library_entries     enable row level security;
alter table public.media_cache         enable row level security;
alter table public.activity_log        enable row level security;
alter table public.anilist_connections enable row level security;
alter table public.notifications       enable row level security;
alter table public.news_items          enable row level security;

-- profiles: owner read/update. Insert happens via trigger, delete via
-- the delete-account Edge Function (service role).
create policy "profiles_select_own" on public.profiles
  for select using ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- library_entries: full owner CRUD.
create policy "library_select_own" on public.library_entries
  for select using ((select auth.uid()) = user_id);
create policy "library_insert_own" on public.library_entries
  for insert with check ((select auth.uid()) = user_id);
create policy "library_update_own" on public.library_entries
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "library_delete_own" on public.library_entries
  for delete using ((select auth.uid()) = user_id);

-- activity_log: owner read/insert/delete; entries are immutable.
create policy "activity_select_own" on public.activity_log
  for select using ((select auth.uid()) = user_id);
create policy "activity_insert_own" on public.activity_log
  for insert with check ((select auth.uid()) = user_id);
create policy "activity_delete_own" on public.activity_log
  for delete using ((select auth.uid()) = user_id);

-- media_cache: public read; writes only via service role (bypasses RLS).
create policy "media_cache_public_read" on public.media_cache
  for select using (true);

-- news_items: same shape as media_cache.
create policy "news_public_read" on public.news_items
  for select using (true);

-- notifications: owner read, mark-as-read, delete. Created by service role.
create policy "notifications_select_own" on public.notifications
  for select using ((select auth.uid()) = user_id);
create policy "notifications_update_own" on public.notifications
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "notifications_delete_own" on public.notifications
  for delete using ((select auth.uid()) = user_id);

-- anilist_connections: owner may see link status, toggle sync, unlink.
-- Rows are created by the OAuth Edge Function (Phase 6, service role).
create policy "anilist_select_own" on public.anilist_connections
  for select using ((select auth.uid()) = user_id);
create policy "anilist_update_own" on public.anilist_connections
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "anilist_delete_own" on public.anilist_connections
  for delete using ((select auth.uid()) = user_id);

-- Column-level lockdown: even the row owner must never read or write the
-- token from the client. RLS is row-level only, so this is done with grants.
revoke all on public.anilist_connections from anon, authenticated;
grant select (user_id, anilist_user_id, expires_at, last_synced_at, sync_enabled, created_at)
  on public.anilist_connections to authenticated;
grant update (sync_enabled) on public.anilist_connections to authenticated;
grant delete on public.anilist_connections to authenticated;
