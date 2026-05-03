-- Portfolio positions table
create table public.portfolio_positions (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  symbol        text        not null,
  name          text        not null default '',
  currency      text        not null default 'USD',
  entry_price   numeric(18,6) not null,
  shares        numeric(18,6) not null default 1,
  entry_date    date        not null default current_date,
  stop_loss     numeric(18,6),
  notes         text        not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.portfolio_positions enable row level security;

create policy "portfolio_select_own"
  on public.portfolio_positions for select
  using (auth.uid() = user_id);

create policy "portfolio_insert_own"
  on public.portfolio_positions for insert
  with check (auth.uid() = user_id);

create policy "portfolio_update_own"
  on public.portfolio_positions for update
  using (auth.uid() = user_id);

create policy "portfolio_delete_own"
  on public.portfolio_positions for delete
  using (auth.uid() = user_id);

-- Auto-update updated_at on row change
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger portfolio_touch_updated_at
  before update on public.portfolio_positions
  for each row execute function public.touch_updated_at();
