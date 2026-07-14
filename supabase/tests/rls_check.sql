-- RLS smoke test (§8): user A must never read or write user B's rows.
-- Run in the Supabase SQL editor as postgres. Everything rolls back at the
-- end — nothing persists.
begin;

-- Two throwaway users; the signup trigger creates their profiles.
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

insert into public.anilist_connections (user_id, anilist_user_id, access_token)
values ('00000000-0000-4000-8000-00000000000b', 999, 'SECRET_TOKEN_B');

-- ---- act as user A ----
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- sees only own library rows
  select count(*) into n from public.library_entries;
  if n <> 1 then raise exception 'FAIL: A sees % library rows, expected 1', n; end if;

  -- sees only own profile
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'FAIL: A sees % profiles, expected 1', n; end if;

  -- cannot update B's entry (0 rows affected)
  update public.library_entries set progress = 99
   where user_id = '00000000-0000-4000-8000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A updated % of B''s rows', n; end if;

  -- cannot insert rows for B
  begin
    insert into public.library_entries (user_id, anilist_media_id, media_type)
    values ('00000000-0000-4000-8000-00000000000b', 202, 'MANGA');
    raise exception 'FAIL: A inserted a row for B';
  exception when insufficient_privilege or check_violation then
    null; -- expected: RLS with-check rejection
  end;

  -- cannot read anyone's AniList token, not even their own (column grant)
  begin
    perform access_token from public.anilist_connections;
    raise exception 'FAIL: authenticated role can read access_token';
  exception when insufficient_privilege then
    null; -- expected
  end;

  -- media_cache is readable but not writable
  perform 1 from public.media_cache;
  begin
    insert into public.media_cache (anilist_media_id, media_type) values (1, 'ANIME');
    raise exception 'FAIL: authenticated role wrote to media_cache';
  exception when insufficient_privilege then
    null; -- expected
  end;

  raise notice 'RLS smoke test: all checks passed';
end $$;

rollback;
