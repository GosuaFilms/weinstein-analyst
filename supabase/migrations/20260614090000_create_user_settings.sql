-- User notification preferences
create table if not exists public.user_settings (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  daily_email_enabled boolean not null default true,
  updated_at          timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "Users can select own settings" on public.user_settings
  for select using (auth.uid() = user_id);

create policy "Users can upsert own settings" on public.user_settings
  for insert with check (auth.uid() = user_id);

create policy "Users can update own settings" on public.user_settings
  for update using (auth.uid() = user_id);
