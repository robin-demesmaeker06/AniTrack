-- Phase 2: per-user rate limiting for Edge Functions (§8).
-- Service-role only — RLS enabled with no policies.

create table public.edge_rate_limits (
  user_id      uuid not null,
  action       text not null,
  window_start timestamptz not null,
  count        integer not null default 1,
  primary key (user_id, action, window_start)
);

alter table public.edge_rate_limits enable row level security;

-- Atomic fixed-window counter. Returns true while the caller is under
-- p_limit for the current minute. Cleans old windows opportunistically.
create or replace function public.bump_rate_limit(
  p_user uuid,
  p_action text,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
  v_window timestamptz := date_trunc('minute', now());
begin
  insert into public.edge_rate_limits as r (user_id, action, window_start, count)
  values (p_user, p_action, v_window, 1)
  on conflict (user_id, action, window_start)
  do update set count = r.count + 1
  returning r.count into v_count;

  delete from public.edge_rate_limits
   where window_start < now() - interval '10 minutes';

  return v_count <= p_limit;
end;
$$;

-- Only the service role (Edge Functions) may call it.
revoke execute on function public.bump_rate_limit(uuid, text, integer)
  from public, anon, authenticated;
