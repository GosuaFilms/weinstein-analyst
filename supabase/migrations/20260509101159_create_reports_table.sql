create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  ticker      text not null,
  name        text not null,
  html        text not null,
  created_at  timestamptz not null default now()
);

alter table public.reports enable row level security;

create policy "users manage own reports"
  on public.reports for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists reports_user_id_idx on public.reports(user_id, created_at desc);
