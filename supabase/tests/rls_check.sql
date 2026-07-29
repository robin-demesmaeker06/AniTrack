-- RLS smoke test (§8): user A must never read or write user B's rows, and the
-- service-role-only tables must be invisible to clients entirely.
--
-- Covers every table in the schema as of Phase 6b:
--   profiles, library_entries, activity_log, notifications, anilist_connections,
--   anilist_sync_queue, media_cache, news_items, edge_rate_limits
-- plus the three SECURITY DEFINER functions (bump_rate_limit,
-- insert_notifications, enqueue_anilist_sync).
--
-- Run in the Supabase SQL editor as postgres. Everything rolls back at the
-- end — nothing persists. A failure aborts with a FAIL: message naming the
-- table and the expectation that broke.
begin;

-- ---------------------------------------------------------------- seed
-- Seeded as postgres, which bypasses RLS. The signup trigger creates profiles.

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-00000000000a',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rls_test_a@example.com', 'x', now(),
   '{"provider":"email","providers":["email"]}', '{"username":"rls_test_a"}',
   now(), now()),
  ('00000000-0000-4000-8000-00000000000b',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rls_test_b@example.com', 'x', now(),
   '{"provider":"email","providers":["email"]}', '{"username":"rls_test_b"}',
   now(), now());

insert into public.library_entries (user_id, anilist_media_id, media_type, status, progress)
values
  ('00000000-0000-4000-8000-00000000000a', 101, 'ANIME', 'CURRENT', 3),
  ('00000000-0000-4000-8000-00000000000b', 101, 'ANIME', 'CURRENT', 7);

insert into public.activity_log (user_id, action, anilist_media_id, media_type)
values
  ('00000000-0000-4000-8000-00000000000a', 'progress', 101, 'ANIME'),
  ('00000000-0000-4000-8000-00000000000b', 'progress', 101, 'ANIME');

insert into public.notifications (user_id, type, anilist_media_id, payload)
values
  ('00000000-0000-4000-8000-00000000000a', 'NEW_EPISODE', 101, '{"number":"4"}'),
  ('00000000-0000-4000-8000-00000000000b', 'NEW_EPISODE', 101, '{"number":"8"}');

-- A gets a live, sync-enabled link so the enqueue RPC has something to gate on.
insert into public.anilist_connections (user_id, anilist_user_id, access_token, sync_enabled)
values
  ('00000000-0000-4000-8000-00000000000a', 888, 'SECRET_TOKEN_A', true),
  ('00000000-0000-4000-8000-00000000000b', 999, 'SECRET_TOKEN_B', true);

insert into public.anilist_sync_queue (user_id, anilist_media_id, media_type, operation)
values
  ('00000000-0000-4000-8000-00000000000a', 101, 'ANIME', 'upsert'),
  ('00000000-0000-4000-8000-00000000000b', 101, 'ANIME', 'upsert');

insert into public.media_cache (anilist_media_id, media_type)
values (101, 'ANIME')
on conflict do nothing;

insert into public.news_items (source, guid, title, url)
values ('rls_test', 'rls_test_guid_1', 'RLS test headline', 'https://example.com/1')
on conflict do nothing;

-- Service-role-only table: rows exist for BOTH users, so "A sees 0" is a real
-- assertion about RLS and not just an empty table.
insert into public.edge_rate_limits (user_id, action, window_start, count)
values
  ('00000000-0000-4000-8000-00000000000a', 'rls_test', date_trunc('minute', now()), 1),
  ('00000000-0000-4000-8000-00000000000b', 'rls_test', date_trunc('minute', now()), 1);

-- ---------------------------------------------------------------- act as A
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- ------------------------------------------------------------- profiles
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'FAIL: profiles — A sees %, expected 1', n; end if;

  update public.profiles set username = 'hijacked'
   where id = '00000000-0000-4000-8000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: profiles — A updated % of B''s rows', n; end if;

  -- ------------------------------------------------------- library_entries
  select count(*) into n from public.library_entries;
  if n <> 1 then raise exception 'FAIL: library_entries — A sees %, expected 1', n; end if;

  update public.library_entries set progress = 99
   where user_id = '00000000-0000-4000-8000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: library_entries — A updated % of B''s rows', n; end if;

  delete from public.library_entries
   where user_id = '00000000-0000-4000-8000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: library_entries — A deleted % of B''s rows', n; end if;

  begin
    insert into public.library_entries (user_id, anilist_media_id, media_type)
    values ('00000000-0000-4000-8000-00000000000b', 202, 'MANGA');
    raise exception 'FAIL: library_entries — A inserted a row for B';
  exception when insufficient_privilege or check_violation then
    null; -- expected: RLS with-check rejection
  end;

  -- ----------------------------------------------------------- activity_log
  select count(*) into n from public.activity_log;
  if n <> 1 then raise exception 'FAIL: activity_log — A sees %, expected 1', n; end if;

  begin
    insert into public.activity_log (user_id, action, anilist_media_id, media_type)
    values ('00000000-0000-4000-8000-00000000000b', 'progress', 303, 'ANIME');
    raise exception 'FAIL: activity_log — A inserted a row for B';
  exception when insufficient_privilege or check_violation then
    null;
  end;

  -- Activity entries are immutable: no update policy exists, so even the
  -- owner's own row must not be editable.
  update public.activity_log set action = 'score'
   where user_id = '00000000-0000-4000-8000-00000000000a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: activity_log — A edited % of their own rows (should be immutable)', n; end if;

  -- ---------------------------------------------------------- notifications
  select count(*) into n from public.notifications;
  if n <> 1 then raise exception 'FAIL: notifications — A sees %, expected 1', n; end if;

  -- Owner may mark their own read...
  update public.notifications set read = true
   where user_id = '00000000-0000-4000-8000-00000000000a';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: notifications — A could not mark their own read (% rows)', n; end if;

  -- ...but not B's.
  update public.notifications set read = true
   where user_id = '00000000-0000-4000-8000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: notifications — A updated % of B''s rows', n; end if;

  -- No insert policy at all: notifications are service-role-created.
  begin
    insert into public.notifications (user_id, type, anilist_media_id, payload)
    values ('00000000-0000-4000-8000-00000000000a', 'NEW_EPISODE', 404, '{"number":"1"}');
    raise exception 'FAIL: notifications — A forged a notification for themselves';
  exception when insufficient_privilege or check_violation then
    null;
  end;

  -- --------------------------------------------------- anilist_connections
  select count(*) into n from public.anilist_connections;
  if n <> 1 then raise exception 'FAIL: anilist_connections — A sees %, expected 1', n; end if;

  -- The token column is unreadable even for the row owner (column grant).
  begin
    perform access_token from public.anilist_connections;
    raise exception 'FAIL: anilist_connections — authenticated can read access_token';
  exception when insufficient_privilege then
    null;
  end;

  -- Owner may toggle sync_enabled (the only granted update column)...
  update public.anilist_connections set sync_enabled = false
   where user_id = '00000000-0000-4000-8000-00000000000a';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: anilist_connections — A could not toggle their own sync_enabled'; end if;
  update public.anilist_connections set sync_enabled = true
   where user_id = '00000000-0000-4000-8000-00000000000a';

  -- ...but must not write any other column.
  begin
    update public.anilist_connections set anilist_user_id = 1234
     where user_id = '00000000-0000-4000-8000-00000000000a';
    raise exception 'FAIL: anilist_connections — A wrote a non-granted column';
  exception when insufficient_privilege then
    null;
  end;

  -- And must not overwrite a token.
  begin
    update public.anilist_connections set access_token = 'STOLEN'
     where user_id = '00000000-0000-4000-8000-00000000000a';
    raise exception 'FAIL: anilist_connections — A wrote access_token';
  exception when insufficient_privilege then
    null;
  end;

  -- ------------------------------------------------- anilist_sync_queue (6b)
  select count(*) into n from public.anilist_sync_queue;
  if n <> 1 then raise exception 'FAIL: anilist_sync_queue — A sees %, expected 1', n; end if;

  -- Select-own is the ONLY policy: no direct writes from the client.
  begin
    insert into public.anilist_sync_queue (user_id, anilist_media_id, media_type, operation)
    values ('00000000-0000-4000-8000-00000000000a', 505, 'ANIME', 'upsert');
    raise exception 'FAIL: anilist_sync_queue — A inserted directly (should go via the RPC)';
  exception when insufficient_privilege or check_violation then
    null;
  end;

  -- Resetting attempts/next_attempt_at by hand would let a client escape the
  -- retry ladder — no update policy, so this must affect nothing.
  update public.anilist_sync_queue set attempts = 0, next_attempt_at = now()
   where user_id = '00000000-0000-4000-8000-00000000000a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: anilist_sync_queue — A updated % of their own queue rows', n; end if;

  delete from public.anilist_sync_queue
   where user_id = '00000000-0000-4000-8000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: anilist_sync_queue — A deleted % of B''s queue rows', n; end if;

  -- ------------------------------------------------------------ media_cache
  perform 1 from public.media_cache; -- public read is intended
  begin
    insert into public.media_cache (anilist_media_id, media_type) values (1, 'ANIME');
    raise exception 'FAIL: media_cache — authenticated wrote to a service-write table';
  exception when insufficient_privilege or check_violation then
    null;
  end;

  -- ------------------------------------------------------------- news_items
  perform 1 from public.news_items; -- public read is intended
  begin
    insert into public.news_items (source, guid, title, url)
    values ('forged', 'forged_guid', 'Forged', 'https://example.com/x');
    raise exception 'FAIL: news_items — authenticated wrote to a service-write table';
  exception when insufficient_privilege or check_violation then
    null;
  end;

  -- ------------------------------------------------------- edge_rate_limits
  -- RLS enabled with NO policies: invisible even though A owns a row. If this
  -- ever returns rows, a client can read (and potentially game) rate limits.
  select count(*) into n from public.edge_rate_limits;
  if n <> 0 then raise exception 'FAIL: edge_rate_limits — A sees % rows, expected 0', n; end if;

  begin
    insert into public.edge_rate_limits (user_id, action, window_start, count)
    values ('00000000-0000-4000-8000-00000000000a', 'forged', date_trunc('minute', now()), 0);
    raise exception 'FAIL: edge_rate_limits — A inserted a counter row';
  exception when insufficient_privilege or check_violation then
    null;
  end;

  -- ------------------------------------------------- definer function grants
  -- bump_rate_limit and insert_notifications are service-role only.
  begin
    perform public.bump_rate_limit('00000000-0000-4000-8000-00000000000a', 'forged', 1);
    raise exception 'FAIL: bump_rate_limit — callable by authenticated';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.insert_notifications('[]'::jsonb);
    raise exception 'FAIL: insert_notifications — callable by authenticated';
  exception when insufficient_privilege then
    null;
  end;

  -- enqueue_anilist_sync IS granted to authenticated, but derives the user
  -- from auth.uid() — there is no user parameter to spoof. Calling it must
  -- enqueue for A and nobody else.
  perform public.enqueue_anilist_sync(606::bigint, 'ANIME'::public.media_type, 'upsert', null);
  select count(*) into n from public.anilist_sync_queue;
  if n <> 2 then raise exception 'FAIL: enqueue_anilist_sync — A''s queue has % rows, expected 2', n; end if;

  raise notice 'RLS smoke test (user A): all checks passed';
end $$;

-- ---------------------------------------------------------------- act as B
-- Spot-check the reverse direction so a policy that accidentally hard-codes
-- user A's id would still be caught.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.library_entries;
  if n <> 1 then raise exception 'FAIL: library_entries — B sees %, expected 1', n; end if;

  select count(*) into n from public.notifications;
  if n <> 1 then raise exception 'FAIL: notifications — B sees %, expected 1', n; end if;

  -- B must not see the row A enqueued through the RPC a moment ago.
  select count(*) into n from public.anilist_sync_queue;
  if n <> 1 then raise exception 'FAIL: anilist_sync_queue — B sees %, expected 1', n; end if;

  select count(*) into n from public.edge_rate_limits;
  if n <> 0 then raise exception 'FAIL: edge_rate_limits — B sees % rows, expected 0', n; end if;

  begin
    perform access_token from public.anilist_connections;
    raise exception 'FAIL: anilist_connections — B can read access_token';
  exception when insufficient_privilege then
    null;
  end;

  raise notice 'RLS smoke test (user B): all checks passed';
end $$;

rollback;
