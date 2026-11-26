-- Market thermometer (2026-11-26): breadth per index, Weinstein's first step
-- (market → sector → stock). Written by stage2-daily from stock_pages after each
-- scan; one row per index plus 'ALL' (every stock once).
--   pct_above   % of stocks closing above their 30-week MA (latest week)
--   pct_uptrend % above a RISING 30-week MA (slope > 0.5 % over 5 weeks), the
--               weekly-chart stand-in for Stage 2 that can be rebuilt back in time
--   pct_stage2  % in Stage 2 with the full classifier (latest scan only)
--   series      weekly { t, above, up } for the last ~73 weeks, from each stock's chart
-- Applied with `supabase db query --linked -f` (remote history only tracks 0001–0010).

create table if not exists public.market_breadth (
  index_id     text primary key,
  scan_date    date not null,
  n            int not null,
  counts       jsonb not null,          -- { STAGE_1: n, STAGE_2: n, STAGE_3: n, STAGE_4: n }
  pct_above    numeric,
  pct_uptrend  numeric,
  pct_stage2   numeric,
  index_stage  text,                    -- stage of the index itself (its members' benchmark)
  benchmark    text,
  series       jsonb not null,          -- { t: [...], above: [...], up: [...] }
  updated_at   timestamptz not null default now()
);
alter table public.market_breadth enable row level security;
drop policy if exists market_breadth_public_read on public.market_breadth;
create policy market_breadth_public_read on public.market_breadth for select using (true);
grant select on public.market_breadth to anon, authenticated;
