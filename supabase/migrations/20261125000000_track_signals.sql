-- Automatic track record: every fresh Stage 2 entry found by the daily scan
-- becomes a signal, held while the stock stays in Stage 2 and closed when it
-- leaves it or closes at/below its initial stop. Written only by stage2-daily
-- (service role); readable by anyone for the public /resultados page.

create table if not exists public.track_signals (
  id                bigserial primary key,
  symbol            text        not null,
  name              text        not null,
  index_id          text        not null,
  currency          text,
  confidence        text,
  entry_date        date        not null,
  entry_price       numeric     not null,
  stop_loss         numeric,
  distance_pct      numeric,
  mansfield_rs      numeric,
  benchmark_symbol  text,
  benchmark_entry   numeric,
  status            text        not null default 'open' check (status in ('open', 'closed')),
  exit_date         date,
  exit_price        numeric,
  exit_reason       text        check (exit_reason in ('stage_exit', 'stop')),
  benchmark_exit    numeric,
  last_date         date,
  last_price        numeric,
  benchmark_last    numeric,
  -- true when the scan had a hole of several days around the exit, so the
  -- exit date/price is the first scan after the hole rather than the real day
  data_gap          boolean     not null default false,
  created_at        timestamptz not null default now()
);

create unique index if not exists track_signals_one_open on public.track_signals (symbol) where status = 'open';
create unique index if not exists track_signals_symbol_entry on public.track_signals (symbol, entry_date);
create index if not exists track_signals_entry_date on public.track_signals (entry_date desc);

alter table public.track_signals enable row level security;
drop policy if exists "track_signals_read_all" on public.track_signals;
create policy "track_signals_read_all" on public.track_signals for select using (true);
