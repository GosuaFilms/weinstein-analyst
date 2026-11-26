-- "Invita a un amigo" (2026-11-26).
-- Each user gets a short code (link alphastage.finance/?ref=CODE). A friend who
-- signs up through it gets FRIEND_BONUS extra analyses at once; the person who
-- invited gets REFERRER_BONUS when that friend runs a first analysis (a real
-- user, not just an e-mail), for at most MAX_REWARDED friends.
-- Extra analyses never expire and are spent only after the plan's own quota.
-- Applied with `supabase db query --linked -f` (remote history only tracks 0001–0010).

-- 1. Codes (separate table: profiles is user-writable, these must not be)
create table if not exists public.referral_codes (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  code       text not null unique check (code ~ '^[a-z2-9]{7}$'),
  created_at timestamptz not null default now()
);
alter table public.referral_codes enable row level security;

-- 2. Who invited whom
create table if not exists public.referrals (
  referred_id uuid primary key references auth.users(id) on delete cascade,
  referrer_id uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  activated_at timestamptz,          -- friend's first analysis
  rewarded    boolean not null default false
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id);
alter table public.referrals enable row level security;

-- 3. Extra analyses granted (balance = sum(amount) − analyses recorded as bonus)
create table if not exists public.ai_bonus (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  amount     int not null check (amount > 0),
  reason     text not null check (reason in ('referral_friend', 'referral_referrer', 'manual')),
  related_user uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ai_bonus_user_idx on public.ai_bonus (user_id);
alter table public.ai_bonus enable row level security;

alter table public.ai_usage add column if not exists from_bonus boolean not null default false;

-- 4. Plan quota counts exclude analyses paid with extra analyses
create or replace function public.ai_usage_for(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'plan',             coalesce((select plan from public.profiles where id = p_user), 'free'),
    'analysis_month',   (select count(*) from public.ai_usage where user_id = p_user and kind = 'analysis'  and not from_bonus and created_at >= date_trunc('month', now())),
    'analysis_day',     (select count(*) from public.ai_usage where user_id = p_user and kind = 'analysis'  and not from_bonus and created_at >= date_trunc('day', now())),
    'operation_month',  (select count(*) from public.ai_usage where user_id = p_user and kind = 'operation' and not from_bonus and created_at >= date_trunc('month', now())),
    'operation_day',    (select count(*) from public.ai_usage where user_id = p_user and kind = 'operation' and not from_bonus and created_at >= date_trunc('day', now())),
    'bonus_left', greatest(0,
      coalesce((select sum(amount) from public.ai_bonus where user_id = p_user), 0)
      - (select count(*) from public.ai_usage where user_id = p_user and from_bonus))
  );
$$;

-- 5. Reward the inviter on the friend's first analysis
create or replace function public.reward_referral_on_usage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  max_rewarded constant int := 10;
  referrer_bonus constant int := 5;
begin
  select * into r from public.referrals
   where referred_id = new.user_id and activated_at is null
   for update;
  if not found then
    return new;
  end if;
  update public.referrals set activated_at = now() where referred_id = new.user_id;
  if (select count(*) from public.referrals where referrer_id = r.referrer_id and rewarded) < max_rewarded then
    update public.referrals set rewarded = true where referred_id = new.user_id;
    insert into public.ai_bonus (user_id, amount, reason, related_user)
    values (r.referrer_id, referrer_bonus, 'referral_referrer', new.user_id);
  end if;
  return new;
end;
$$;
revoke all on function public.reward_referral_on_usage() from public, anon, authenticated;

drop trigger if exists reward_referral on public.ai_usage;
create trigger reward_referral after insert on public.ai_usage
  for each row when (new.kind = 'analysis')
  execute function public.reward_referral_on_usage();

-- 6. The caller's code (created on first use) and stats
create or replace function public.my_referral()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  c text;
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
begin
  if uid is null then
    return null;
  end if;
  select code into c from public.referral_codes where user_id = uid;
  while c is null loop
    c := (select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
            from generate_series(1, 7));
    begin
      insert into public.referral_codes (user_id, code) values (uid, c);
    exception when unique_violation then
      select code into c from public.referral_codes where user_id = uid;  -- null → retry
    end;
  end loop;
  return jsonb_build_object(
    'code', c,
    'signed_up', (select count(*) from public.referrals where referrer_id = uid),
    'activated', (select count(*) from public.referrals where referrer_id = uid and activated_at is not null),
    'rewarded',  (select count(*) from public.referrals where referrer_id = uid and rewarded),
    'max_rewarded', 10,
    'referrer_bonus', 5,
    'friend_bonus', 3,
    'bonus_left', (public.ai_usage_for(uid)->>'bonus_left')::int
  );
end;
$$;
revoke all on function public.my_referral() from public, anon;
grant execute on function public.my_referral() to authenticated;

-- 7. Public check for the welcome banner (no data about the inviter)
create or replace function public.referral_code_valid(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.referral_codes where code = lower(trim(p_code)));
$$;
revoke all on function public.referral_code_valid(text) from public;
grant execute on function public.referral_code_valid(text) to anon, authenticated;

-- 8. set_signup_source also links the referral and gives the friend the bonus
create or replace function public.set_signup_source(p jsonb)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  cleaned jsonb;
  inviter uuid;
  friend_bonus constant int := 3;
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

  -- Referral: only new accounts, never yourself, only once
  if cleaned ? 'ref' and exists (
       select 1 from auth.users u where u.id = auth.uid() and u.created_at >= now() - interval '1 day') then
    select user_id into inviter from public.referral_codes where code = lower(cleaned->>'ref');
    if inviter is not null and inviter <> auth.uid() then
      insert into public.referrals (referred_id, referrer_id) values (auth.uid(), inviter)
      on conflict (referred_id) do nothing;
      if found then
        insert into public.ai_bonus (user_id, amount, reason, related_user)
        values (auth.uid(), friend_bonus, 'referral_friend', inviter);
      end if;
    end if;
  end if;
end;
$$;

revoke all on function public.set_signup_source(jsonb) from public, anon;
grant execute on function public.set_signup_source(jsonb) to authenticated;

-- 9. Admin metrics: friends' sign-ups grouped as one source, plus referral totals
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
            when exists (select 1 from public.referrals r where r.referred_id = p.id) then 'invitación de amigo'
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
    'referrals', jsonb_build_object(
      'signed_up', (select count(*) from public.referrals),
      'activated', (select count(*) from public.referrals where activated_at is not null),
      'inviters',  (select count(distinct referrer_id) from public.referrals),
      'codes',     (select count(*) from public.referral_codes)
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
