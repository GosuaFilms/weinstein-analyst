-- Take down a shared analysis (2026-11-26). Clients can't read shared_analyses.user_id,
-- so listing and removing go through these functions. The preview image
-- (share-cards/<id>.png) is removed by the client through the Storage API first,
-- while the row still proves ownership (policy share_cards_delete_own).
-- Applied with `supabase db query --linked -f` (remote history only tracks 0001–0010).

create or replace function public.my_shared_analyses()
returns table (id text, ticker text, company_name text, stage text, verdict text, has_card boolean, ref_code text, created_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, s.ticker, s.company_name, s.payload->>'stage', s.payload->>'verdict', s.has_card, s.ref_code, s.created_at
    from public.shared_analyses s
   where s.user_id = auth.uid()
   order by s.created_at desc
   limit 200;
$$;
revoke all on function public.my_shared_analyses() from public, anon;
grant execute on function public.my_shared_analyses() to authenticated;

create or replace function public.unshare_analysis(p_id text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.shared_analyses where id = p_id and user_id = auth.uid();
  return found;
end;
$$;
revoke all on function public.unshare_analysis(text) from public, anon;
grant execute on function public.unshare_analysis(text) to authenticated;
