-- Weinstein sector analysis: daily stage of 27 sector ETFs (11 US SPDR, 16 iShares
-- STOXX Europe 600), with Mansfield RS against S&P 500 / STOXX 600. Written by the
-- sector-ranking function; readable by anyone.
create table if not exists public.sector_ranking (
  scan_date   date    not null,
  etf         text    not null,
  region      text    not null check (region in ('US', 'EU')),
  name_es     text    not null,
  name_en     text    not null,
  stage       text    not null,
  confidence  text,
  rs          numeric,
  rs_trend    text,
  dist_pct    numeric,
  sma_trend   text,
  price       numeric,
  rank        int     not null,   -- within its region, 1 = strongest
  created_at  timestamptz not null default now(),
  primary key (scan_date, etf)
);
create index if not exists sector_ranking_date on public.sector_ranking (scan_date desc);
alter table public.sector_ranking enable row level security;
drop policy if exists "sector_ranking_read_all" on public.sector_ranking;
create policy "sector_ranking_read_all" on public.sector_ranking for select using (true);

alter table public.stage2_snapshots add column if not exists sector_etf text;

-- Daily after the Stage 2 scan (22:00 UTC); reuses that job's command so the
-- cron secret is never written here.
select cron.unschedule('sector-ranking-2215-utc')
where exists (select 1 from cron.job where jobname = 'sector-ranking-2215-utc');
select cron.schedule(
  'sector-ranking-2215-utc',
  '15 22 * * 1-5',
  replace(
    (select command from cron.job where jobname = 'stage2-daily-scan-2200-utc'),
    '/functions/v1/stage2-daily',
    '/functions/v1/sector-ranking'
  )
);
