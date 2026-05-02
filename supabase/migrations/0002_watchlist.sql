-- ============================================================================
-- Watchlist — tickers que el usuario quiere vigilar
-- ============================================================================

create table public.watchlist (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  symbol      text not null,
  name        text,
  added_at    timestamptz not null default now(),
  unique (user_id, symbol)
);

create index watchlist_user_idx on public.watchlist (user_id, added_at desc);

alter table public.watchlist enable row level security;

create policy "watchlist_select_own" on public.watchlist
  for select using (auth.uid() = user_id);

create policy "watchlist_insert_own" on public.watchlist
  for insert with check (auth.uid() = user_id);

create policy "watchlist_delete_own" on public.watchlist
  for delete using (auth.uid() = user_id);
