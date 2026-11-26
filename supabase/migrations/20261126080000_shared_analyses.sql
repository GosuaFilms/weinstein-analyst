-- Share an analysis (2026-11-26): public page /a/<id> with a preview image.
-- Only analyses the server really produced can be shared: analyze-market keeps
-- each result in ai_results (service role only) and returns its id; the user
-- shares by that id, so nobody can publish a made-up verdict under our domain.
-- Applied with `supabase db query --linked -f` (remote history only tracks 0001–0010).

-- 1. Server-side copy of every analysis result (never readable by clients)
create table if not exists public.ai_results (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  result     jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_results_user_idx on public.ai_results (user_id, created_at desc);
alter table public.ai_results enable row level security;

-- 2. Public snapshots
create table if not exists public.shared_analyses (
  id           text primary key check (id ~ '^[a-z2-9]{10}$'),
  user_id      uuid not null references auth.users(id) on delete cascade,
  result_id    uuid not null unique references public.ai_results(id) on delete cascade,
  ticker       text,
  company_name text,
  payload      jsonb not null,
  ref_code     text,
  has_card     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists shared_analyses_user_idx on public.shared_analyses (user_id, created_at desc);
alter table public.shared_analyses enable row level security;

-- Anyone can read a shared analysis (but not who shared it)
revoke all on public.shared_analyses from anon, authenticated;
grant select (id, ticker, company_name, payload, ref_code, has_card, created_at) on public.shared_analyses to anon, authenticated;
drop policy if exists shared_analyses_public_read on public.shared_analyses;
create policy shared_analyses_public_read on public.shared_analyses for select using (true);
-- The author can take it down
grant delete on public.shared_analyses to authenticated;
drop policy if exists shared_analyses_delete_own on public.shared_analyses;
create policy shared_analyses_delete_own on public.shared_analyses for delete using (user_id = (select auth.uid()));

-- 3. Create (or return) the public link for one of the caller's results
create or replace function public.share_analysis(p_result_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  r public.ai_results;
  existing public.shared_analyses;
  new_id text;
  code text;
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  snap jsonb;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  select * into r from public.ai_results where id = p_result_id and user_id = uid;
  if not found then
    raise exception 'analysis not found';
  end if;
  select * into existing from public.shared_analyses where result_id = p_result_id;
  if found then
    return jsonb_build_object('id', existing.id, 'ref', existing.ref_code, 'has_card', existing.has_card);
  end if;
  if (select count(*) from public.shared_analyses where user_id = uid and created_at > now() - interval '1 day') >= 30 then
    raise exception 'share limit reached';
  end if;

  code := (public.my_referral())->>'code';
  -- Only what the public page shows; no chart images, no raw market snapshot
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into snap
    from jsonb_each(r.result)
   where key in ('companyName', 'tickerSymbol', 'currentPrice', 'priceTimestamp', 'stage', 'sma30Analysis',
                 'relativeStrength', 'volumeAnalysis', 'support', 'resistance', 'entryPrice', 'stopLoss',
                 'verdict', 'verdictType', 'suggestedStrategy', 'sector');

  loop
    new_id := (select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
                 from generate_series(1, 10));
    begin
      insert into public.shared_analyses (id, user_id, result_id, ticker, company_name, payload, ref_code)
      values (new_id, uid, p_result_id, left(r.result->>'tickerSymbol', 20), left(r.result->>'companyName', 120), snap, code);
      exit;
    exception when unique_violation then
      -- id collision: try another
    end;
  end loop;
  return jsonb_build_object('id', new_id, 'ref', code, 'has_card', false);
end;
$$;
revoke all on function public.share_analysis(uuid) from public, anon;
grant execute on function public.share_analysis(uuid) to authenticated;

create or replace function public.mark_share_card(p_id text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.shared_analyses set has_card = true where id = p_id and user_id = auth.uid();
$$;
revoke all on function public.mark_share_card(text) from public, anon;
grant execute on function public.mark_share_card(text) to authenticated;

-- 4. Preview images: share-cards/<id>.png, uploadable only by the share's author
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('share-cards', 'share-cards', true, 1048576, array['image/png'])
on conflict (id) do nothing;

-- Ownership check usable from storage policies (user_id is not readable by clients)
create or replace function public.owns_share_card(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.shared_analyses s where s.user_id = auth.uid() and p_name = s.id || '.png');
$$;
revoke all on function public.owns_share_card(text) from public, anon;
grant execute on function public.owns_share_card(text) to authenticated;

drop policy if exists share_cards_insert_own on storage.objects;
create policy share_cards_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'share-cards'
    and public.owns_share_card(name)
  );
drop policy if exists share_cards_delete_own on storage.objects;
create policy share_cards_delete_own on storage.objects for delete to authenticated
  using (
    bucket_id = 'share-cards'
    and public.owns_share_card(name)
  );
