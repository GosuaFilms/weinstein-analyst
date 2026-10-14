-- Three plans (free / pro / elite) and server-side AI quotas, 2026-10-14.
-- Applied with `supabase db query --linked -f` (remote history only tracks 0001–0010).

-- 1. New paid tier
alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check check (plan in ('free', 'pro', 'elite'));

-- 2. One row per AI generation that succeeded (analysis or operation review).
--    Written only by edge functions (service role); quotas count these rows,
--    so failed calls don't use up a user's allowance and deleting saved
--    analyses doesn't reset it.
create table if not exists public.ai_usage (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('analysis', 'operation')),
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_kind_created_idx on public.ai_usage (user_id, kind, created_at);
alter table public.ai_usage enable row level security;

-- Plan + usage counts for one user (month = calendar month, day = since 00:00 UTC)
create or replace function public.ai_usage_for(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'plan',             coalesce((select plan from public.profiles where id = p_user), 'free'),
    'analysis_month',   (select count(*) from public.ai_usage where user_id = p_user and kind = 'analysis'  and created_at >= date_trunc('month', now())),
    'analysis_day',     (select count(*) from public.ai_usage where user_id = p_user and kind = 'analysis'  and created_at >= date_trunc('day', now())),
    'operation_month',  (select count(*) from public.ai_usage where user_id = p_user and kind = 'operation' and created_at >= date_trunc('month', now())),
    'operation_day',    (select count(*) from public.ai_usage where user_id = p_user and kind = 'operation' and created_at >= date_trunc('day', now()))
  );
$$;
revoke all on function public.ai_usage_for(uuid) from public, anon, authenticated;
grant execute on function public.ai_usage_for(uuid) to service_role;

-- The signed-in user's own counts, for the counter in the app
create or replace function public.my_ai_usage()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.ai_usage_for((select auth.uid()));
$$;
revoke all on function public.my_ai_usage() from public, anon;
grant execute on function public.my_ai_usage() to authenticated;

-- 3. Admin metrics: paying users = pro + elite
create or replace function public.admin_metrics()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  with weeks as (
    select generate_series(
      date_trunc('week', now()) - interval '11 weeks',
      date_trunc('week', now()),
      interval '1 week'
    ) as w
  )
  select jsonb_build_object(
    'users_total', (select count(*) from auth.users),
    'users_pro',   (select count(*) from public.profiles where plan in ('pro', 'elite')),
    'users_elite', (select count(*) from public.profiles where plan = 'elite'),
    'ai_30d',      (select count(*) from public.ai_usage where created_at >= now() - interval '30 days'),
    'signups_7d',  (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    'dau', (select count(distinct user_id) from public.usage_events where created_at >= now() - interval '1 day'),
    'wau', (select count(distinct user_id) from public.usage_events where created_at >= now() - interval '7 days'),
    'mau', (select count(distinct user_id) from public.usage_events where created_at >= now() - interval '30 days'),
    'tracking_since', (select min(created_at) from public.usage_events),
    'signups_weekly', (
      select coalesce(jsonb_agg(jsonb_build_object('week', to_char(weeks.w, 'YYYY-MM-DD'), 'n', coalesce(c.n, 0)) order by weeks.w), '[]'::jsonb)
      from weeks
      left join (select date_trunc('week', created_at) as w, count(*) as n from auth.users group by 1) c on c.w = weeks.w
    ),
    'active_weekly', (
      select coalesce(jsonb_agg(jsonb_build_object('week', to_char(weeks.w, 'YYYY-MM-DD'), 'n', coalesce(c.n, 0)) order by weeks.w), '[]'::jsonb)
      from weeks
      left join (select date_trunc('week', created_at) as w, count(distinct user_id) as n from public.usage_events group by 1) c on c.w = weeks.w
    ),
    'events_30d', (
      select coalesce(jsonb_agg(jsonb_build_object('event', event, 'n', n, 'users', u) order by n desc), '[]'::jsonb)
      from (
        select event, count(*) as n, count(distinct user_id) as u
        from public.usage_events
        where created_at >= now() - interval '30 days'
        group by event
      ) t
    )
  );
$$;

revoke all on function public.admin_metrics() from public, anon, authenticated;
grant execute on function public.admin_metrics() to service_role;
