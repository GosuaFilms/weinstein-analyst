-- Public stock pages /valor/<slug> (2026-11-26).
-- stage2-daily stores every scanned index constituent (not only Stage 2):
--   stock_pages          one row per stock, latest scan, read by the public page
--   stock_stage_history  one small row per stock and scan day (stage changes, "since")
-- Applied with `supabase db query --linked -f` (remote history only tracks 0001–0010).

create table if not exists public.stock_pages (
  symbol        text primary key,
  slug          text not null unique,
  name          text,
  currency      text,
  index_ids     text[] not null default '{}',
  scan_date     date not null,
  price         numeric,
  change_pct    numeric,           -- week on week (or day, when a quote was used)
  stage         text not null,
  confidence    text,
  reasoning     text,
  stage_since   date,              -- first scan of the current stage run (null = before tracking)
  prev_stage    text,
  sma30         numeric,
  sma30_trend   text,
  distance_pct  numeric,
  rs            numeric,
  rs_trend      text,
  volume_ratio  numeric,
  high52        numeric,
  low52         numeric,
  stop_loss     numeric,
  stop_risk_pct numeric,
  extended      boolean,
  base_resistance numeric,
  benchmark     text,
  benchmark_stage text,
  sector_etf    text,
  chart         jsonb,             -- { t: [...], c: [...], ma: [...] } weekly, ~78 weeks
  updated_at    timestamptz not null default now()
);
create index if not exists stock_pages_sector_idx on public.stock_pages (sector_etf);
alter table public.stock_pages enable row level security;
drop policy if exists stock_pages_public_read on public.stock_pages;
create policy stock_pages_public_read on public.stock_pages for select using (true);

create table if not exists public.stock_stage_history (
  scan_date date not null,
  symbol    text not null,
  stage     text not null,
  price     numeric,
  rs        numeric,
  primary key (symbol, scan_date)
);
alter table public.stock_stage_history enable row level security;
drop policy if exists stock_stage_history_public_read on public.stock_stage_history;
create policy stock_stage_history_public_read on public.stock_stage_history for select using (true);

grant select on public.stock_pages, public.stock_stage_history to anon, authenticated;
