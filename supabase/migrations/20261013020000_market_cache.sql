-- Twelve Data migration: shared market data cache + alerts only in market hours.
-- Applied with `supabase db query --linked` (remote history only tracks 0001–0010).

-- Weekly bars, names and the stock directory, shared by every edge function
-- (_shared/marketData.ts). No policies: only the service role reads or writes it.
create table if not exists public.market_cache (
  key        text primary key,
  payload    jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.market_cache enable row level security;

-- Alerts work on weekly data: every 15 min, Mon–Fri 07:00–21:59 UTC
-- (European open to US close) instead of every 5 min around the clock.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'check-alerts-every-5min'),
  schedule := '*/15 7-21 * * 1-5'
);
