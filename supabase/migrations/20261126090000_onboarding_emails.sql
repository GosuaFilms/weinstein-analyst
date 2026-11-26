-- Welcome e-mails (2026-11-26): three steps for new accounts, sent by the
-- onboarding-emails function (hourly cron).
--   welcome  ~15 min after the e-mail is confirmed (within 2 days of sign-up)
--   day2     2–4 days after sign-up, only if no analysis yet
--   day7     7–10 days after sign-up
-- Only accounts created from 2026-11-26 on; never twice; opt-out with
-- user_settings.onboarding_emails (one-click link in every e-mail).
-- Applied with `supabase db query --linked -f` (remote history only tracks 0001–0010).

alter table public.user_settings add column if not exists onboarding_emails boolean not null default true;

create table if not exists public.onboarding_emails (
  user_id uuid not null references auth.users(id) on delete cascade,
  step    text not null check (step in ('welcome', 'day2', 'day7')),
  sent_at timestamptz not null default now(),
  primary key (user_id, step)
);
alter table public.onboarding_emails enable row level security;

-- Who is due which step now (service role only)
create or replace function public.onboarding_due()
returns table (user_id uuid, email text, name text, step text, analyses bigint)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  with base as (
    select u.id, u.email::text as email, coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)) as name,
           u.created_at, u.email_confirmed_at,
           (select count(*) from public.ai_usage a where a.user_id = u.id) as analyses
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join public.user_settings s on s.user_id = u.id
     where u.created_at >= '2026-11-26'
       and u.email_confirmed_at is not null
       and u.email is not null
       and coalesce(s.onboarding_emails, true)
  ),
  due as (
    select b.*, 'welcome'::text as step from base b
     where b.created_at > now() - interval '2 days'
       and b.email_confirmed_at < now() - interval '15 minutes'
    union all
    select b.*, 'day2' from base b
     where b.created_at <= now() - interval '2 days' and b.created_at > now() - interval '4 days'
       and b.analyses = 0
    union all
    select b.*, 'day7' from base b
     where b.created_at <= now() - interval '7 days' and b.created_at > now() - interval '10 days'
  )
  select d.id, d.email, d.name, d.step, d.analyses
    from due d
   where not exists (select 1 from public.onboarding_emails o where o.user_id = d.id and o.step = d.step);
$$;
revoke all on function public.onboarding_due() from public, anon, authenticated;
grant execute on function public.onboarding_due() to service_role;

-- A user's invite code for e-mails (created if missing; service role only)
create or replace function public.referral_code_for(p_user uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c text;
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
begin
  select code into c from public.referral_codes where user_id = p_user;
  while c is null loop
    c := (select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
            from generate_series(1, 7));
    begin
      insert into public.referral_codes (user_id, code) values (p_user, c);
    exception when unique_violation then
      select code into c from public.referral_codes where user_id = p_user;
    end;
  end loop;
  return c;
end;
$$;
revoke all on function public.referral_code_for(uuid) from public, anon, authenticated;
grant execute on function public.referral_code_for(uuid) to service_role;

-- Hourly at :20, reusing the cron secret of an existing job
select cron.unschedule('onboarding-emails-hourly') where exists (select 1 from cron.job where jobname = 'onboarding-emails-hourly');
select cron.schedule(
  'onboarding-emails-hourly',
  '20 * * * *',
  replace(
    (select command from cron.job where jobname = 'stage2-daily-scan-2200-utc'),
    '/functions/v1/stage2-daily',
    '/functions/v1/onboarding-emails'
  )
);
