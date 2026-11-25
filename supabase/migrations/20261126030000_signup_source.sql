-- Signup source (first touch): UTM tags, ?ref= or referring site, captured in
-- the browser tab (src/lib/attribution.ts) and saved once per new account.

alter table public.profiles add column if not exists signup_source jsonb;

-- Writes the caller's source once, only on accounts created in the last day,
-- keeping only known keys and short values.
create or replace function public.set_signup_source(p jsonb)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  cleaned jsonb;
begin
  if auth.uid() is null then
    return;
  end if;
  -- Email sign-ups store the source in the user metadata from the original tab:
  -- prefer it, since the confirmation link opens a new tab with no source
  select coalesce(u.raw_user_meta_data->'signup_source', p) into p
    from auth.users u where u.id = auth.uid();
  if jsonb_typeof(p) is distinct from 'object' then
    return;
  end if;
  select coalesce(jsonb_object_agg(key, left(value, 60)), '{}'::jsonb)
    into cleaned
    from jsonb_each_text(p)
   where key in ('source', 'medium', 'campaign', 'ref', 'referrer', 'landing')
     and coalesce(value, '') <> '';
  update public.profiles pr
     set signup_source = cleaned
    from auth.users u
   where pr.id = auth.uid()
     and u.id = pr.id
     and pr.signup_source is null
     and u.created_at >= now() - interval '1 day';
end;
$$;

revoke all on function public.set_signup_source(jsonb) from public, anon;
grant execute on function public.set_signup_source(jsonb) to authenticated;

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
    'sources', (
      -- Signups by first-touch source (profiles.signup_source), with how many
      -- ran at least one analysis and how many pay. Older accounts: 'sin datos'.
      select coalesce(jsonb_agg(jsonb_build_object('source', src, 'users', n, 'users_30d', n30, 'activated', act, 'paid', paid) order by n desc), '[]'::jsonb)
      from (
        select
          case
            when p.signup_source is null then 'sin datos'
            else coalesce(p.signup_source->>'source', p.signup_source->>'ref', p.signup_source->>'referrer', 'directo')
          end as src,
          count(*) as n,
          count(*) filter (where u.created_at >= now() - interval '30 days') as n30,
          count(*) filter (where exists (select 1 from public.ai_usage a where a.user_id = p.id)) as act,
          count(*) filter (where p.plan in ('pro', 'elite') and p.stripe_subscription_id is not null) as paid
        from public.profiles p
        join auth.users u on u.id = p.id
        group by 1
      ) s
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
