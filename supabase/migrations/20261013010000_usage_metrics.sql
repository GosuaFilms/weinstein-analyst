-- Usage log + admin metrics (signups, active users, conversion to Pro).
-- Applied by hand in the SQL Editor (remote history only tracks 0001–0010).

-- One row per authenticated call to a user-facing edge function
-- (written by _shared/auth.ts requireUser with the service role).
create table if not exists public.usage_events (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  event      text not null,
  created_at timestamptz not null default now()
);
create index if not exists usage_events_created_idx on public.usage_events (created_at);
create index if not exists usage_events_user_created_idx on public.usage_events (user_id, created_at);

-- No policies: only the service role (edge functions) can read or write it.
alter table public.usage_events enable row level security;

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
    'users_pro',   (select count(*) from public.profiles where plan = 'pro'),
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
