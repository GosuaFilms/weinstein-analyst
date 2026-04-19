-- ============================================================================
-- Weinstein Stage Analyst — Initial schema
-- ============================================================================
-- Tables: profiles, analyses, alerts, alert_events
-- Security: Row Level Security enabled on every user-facing table.
-- Realtime: alerts + alert_events are published for live UI updates.
-- ============================================================================

create extension if not exists "pg_cron" with schema extensions;
create extension if not exists "pg_net" with schema extensions;

-- ───────────────────────────────────────────────────────────
-- PROFILES — mirror of auth.users with app-level fields
-- ───────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_color text not null default 'bg-amber-500',
  preferred_language text not null default 'es' check (preferred_language in ('es', 'en')),
  settings jsonb not null default '{"smaPeriod": 30, "volumeMultiplier": 2.0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- Auto-create a profile row on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_color)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'bg-' || (array['amber','emerald','blue','rose','purple','cyan'])[1 + floor(random()*6)] || '-500'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────────────────────────────────────────
-- ANALYSES — persisted scan/operation history per user
-- ───────────────────────────────────────────────────────────
create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('scan', 'operation')),
  ticker text,
  label text not null,
  result jsonb not null,
  preview_urls text[],
  created_at timestamptz not null default now()
);

create index analyses_user_created_idx on public.analyses (user_id, created_at desc);
create index analyses_user_ticker_idx on public.analyses (user_id, ticker);

alter table public.analyses enable row level security;

create policy "analyses_select_own" on public.analyses
  for select using (auth.uid() = user_id);
create policy "analyses_insert_own" on public.analyses
  for insert with check (auth.uid() = user_id);
create policy "analyses_delete_own" on public.analyses
  for delete using (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────
-- ALERTS — user-configured technical alerts
-- ───────────────────────────────────────────────────────────
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  condition text not null check (condition in (
    'PRICE_CROSS_SMA30_UP',
    'PRICE_CROSS_SMA30_DOWN',
    'VOLUME_SURGE',
    'RESISTANCE_BREAKOUT',
    'SUPPORT_BREAKDOWN'
  )),
  status text not null default 'active' check (status in ('active', 'triggered', 'paused')),
  reference_price numeric,
  reference_level numeric,
  trigger_message text,
  last_checked_at timestamptz,
  triggered_at timestamptz,
  created_at timestamptz not null default now()
);

create index alerts_user_status_idx on public.alerts (user_id, status);
create index alerts_status_idx on public.alerts (status) where status = 'active';

alter table public.alerts enable row level security;

create policy "alerts_select_own" on public.alerts
  for select using (auth.uid() = user_id);
create policy "alerts_insert_own" on public.alerts
  for insert with check (auth.uid() = user_id);
create policy "alerts_update_own" on public.alerts
  for update using (auth.uid() = user_id);
create policy "alerts_delete_own" on public.alerts
  for delete using (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────
-- ALERT_EVENTS — append-only log of triggered alerts
-- ───────────────────────────────────────────────────────────
create table public.alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.alerts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  condition text not null,
  price_at_trigger numeric,
  message text,
  created_at timestamptz not null default now()
);

create index alert_events_user_created_idx on public.alert_events (user_id, created_at desc);

alter table public.alert_events enable row level security;

create policy "alert_events_select_own" on public.alert_events
  for select using (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────
-- REALTIME — publish alerts + alert_events
-- ───────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.alerts;
alter publication supabase_realtime add table public.alert_events;

-- ───────────────────────────────────────────────────────────
-- SCHEDULED JOB — check alerts every 5 min during US market hours
-- (actual price + condition evaluation happens inside the Edge Function)
-- ───────────────────────────────────────────────────────────
-- Replace SUPABASE_PROJECT_URL and CRON_SECRET via SQL after deploy:
--   alter database postgres set "app.supabase_url" to 'https://xxx.supabase.co';
--   alter database postgres set "app.cron_secret" to 'xxxxx';
select cron.schedule(
  'check-alerts-every-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/check-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
