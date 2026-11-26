-- Base breakouts (2026-11-26): Weinstein's buy point, detected by stage2-daily.
-- One row per stock and week; confirmed with the Friday close and the week's
-- volume; marked failed if the price falls back into the base. Pro/Élite users
-- get a nightly message (breakout-alerts) when there are new ones.
-- Applied with `supabase db query --linked -f` (remote history only tracks 0001–0010).

create table if not exists public.base_breakouts (
  id            bigserial primary key,
  symbol        text not null,
  slug          text not null,
  name          text,
  currency      text,
  index_ids     text[] not null default '{}',
  week          date not null,               -- Monday of the breakout week
  detected_on   date not null,
  kind          text not null check (kind in ('base', 'continuation')),
  stage_before  text,
  resistance    numeric not null,
  entry_level   numeric not null,
  price         numeric not null,            -- price on detection
  sma30_trend   text,
  rs            numeric,
  rs_trend      text,
  sector_etf    text,
  benchmark_stage text,
  confirmed     boolean,                     -- null until the week closes
  confirmed_on  date,
  close_week    numeric,
  volume_ratio  numeric,                     -- the breakout week's volume vs its average
  failed_on     date,
  unique (symbol, week)
);
create index if not exists base_breakouts_detected_idx on public.base_breakouts (detected_on desc);
alter table public.base_breakouts enable row level security;
drop policy if exists base_breakouts_read on public.base_breakouts;
create policy base_breakouts_read on public.base_breakouts for select to authenticated using (true);
grant select on public.base_breakouts to authenticated;

alter table public.user_settings add column if not exists breakout_alerts boolean not null default true;

create table if not exists public.breakout_alert_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  channel text not null,
  items   int not null,
  primary key (user_id, day)
);
alter table public.breakout_alert_log enable row level security;

-- Weekdays 22:40 UTC, after the scan (22:00) and the sector ranking (22:15)
select cron.unschedule('breakout-alerts-2240-utc') where exists (select 1 from cron.job where jobname = 'breakout-alerts-2240-utc');
select cron.schedule(
  'breakout-alerts-2240-utc',
  '40 22 * * 1-5',
  replace(
    (select command from cron.job where jobname = 'stage2-daily-scan-2200-utc'),
    '/functions/v1/stage2-daily',
    '/functions/v1/breakout-alerts'
  )
);
