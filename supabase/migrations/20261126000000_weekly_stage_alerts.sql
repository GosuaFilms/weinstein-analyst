-- Weekly stage-change alerts (function weekly-stage-alerts, Fridays after the US close).
-- symbol_weekly_stage keeps one stage per symbol per week so each run can diff
-- against the previous one; stage_alert_log stops a re-run from sending twice.

create table if not exists public.symbol_weekly_stage (
  symbol          text    not null,
  week            date    not null,   -- Friday of the week
  stage           text    not null,
  price           numeric,
  sma30           numeric,
  suggested_stop  numeric,
  currency        text,
  created_at      timestamptz not null default now(),
  primary key (symbol, week)
);
alter table public.symbol_weekly_stage enable row level security;  -- service role only

create table if not exists public.stage_alert_log (
  user_id   uuid not null references auth.users (id) on delete cascade,
  week      date not null,
  channel   text not null,
  items     int  not null,
  sent_at   timestamptz not null default now(),
  primary key (user_id, week)
);
alter table public.stage_alert_log enable row level security;      -- service role only

alter table public.user_settings
  add column if not exists weekly_stage_alerts boolean not null default true;

-- Cron: Fridays 22:30 UTC, after the US close and the 22:00 Stage 2 scan.
-- Reuses the stage2-daily job's command so the cron secret is never written here.
select cron.unschedule('weekly-stage-alerts-fri-2230-utc')
where exists (select 1 from cron.job where jobname = 'weekly-stage-alerts-fri-2230-utc');
select cron.schedule(
  'weekly-stage-alerts-fri-2230-utc',
  '30 22 * * 5',
  replace(
    (select command from cron.job where jobname = 'stage2-daily-scan-2200-utc'),
    '/functions/v1/stage2-daily',
    '/functions/v1/weekly-stage-alerts'
  )
);
