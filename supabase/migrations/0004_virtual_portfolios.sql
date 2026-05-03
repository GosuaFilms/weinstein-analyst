-- Saved virtual portfolios
create table public.virtual_portfolios (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references auth.users(id) on delete cascade,
  label                text        not null default '',
  currency             text        not null,
  amount               numeric(18,2) not null,
  indices              text[]      not null default '{}',
  generated_at         timestamptz not null,
  total_allocated_pct  numeric(5,2),
  cash_reserve_pct     numeric(5,2),
  max_portfolio_risk_pct numeric(5,2),
  positions            jsonb       not null default '[]',
  created_at           timestamptz not null default now()
);

alter table public.virtual_portfolios enable row level security;

create policy "vp_select_own" on public.virtual_portfolios
  for select using (auth.uid() = user_id);

create policy "vp_insert_own" on public.virtual_portfolios
  for insert with check (auth.uid() = user_id);

create policy "vp_update_own" on public.virtual_portfolios
  for update using (auth.uid() = user_id);

create policy "vp_delete_own" on public.virtual_portfolios
  for delete using (auth.uid() = user_id);
