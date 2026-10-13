-- Fixes for `supabase db advisors` (security + performance), 2026-10-14.
-- Applied with `supabase db query --linked -f` (remote history only tracks 0001–0010).

-- Security: pin search_path so a role can't shadow objects these functions use
alter function public.touch_updated_at() set search_path = public, pg_temp;
alter function public.protect_profile_billing() set search_path = public, pg_temp;

-- Security: handle_new_user is a SECURITY DEFINER trigger function; nobody needs
-- to call it through /rest/v1/rpc (triggers still fire without EXECUTE)
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Performance: evaluate auth.uid() once per query, not once per row, in every
-- RLS policy of the public schema ("auth_rls_initplan")
do $$
declare
  p record;
  q text;
  c text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (qual like '%auth.uid()%' or with_check like '%auth.uid()%')
      and coalesce(qual, '') not like '%(select auth.uid()%'
      and coalesce(qual, '') not like '%( SELECT auth.uid()%'
  loop
    q := replace(p.qual, 'auth.uid()', '(select auth.uid())');
    c := replace(p.with_check, 'auth.uid()', '(select auth.uid())');
    execute format('alter policy %I on %I.%I %s %s',
      p.policyname, p.schemaname, p.tablename,
      case when q is not null then format('using (%s)', q) else '' end,
      case when c is not null then format('with check (%s)', c) else '' end);
  end loop;
end $$;

-- Performance: covering indexes for foreign keys
create index if not exists alert_events_alert_id_idx on public.alert_events (alert_id);
create index if not exists portfolio_positions_user_id_idx on public.portfolio_positions (user_id);
create index if not exists virtual_portfolios_user_id_idx on public.virtual_portfolios (user_id);

-- Cleanup: reports was replaced long ago (empty, unused by any code)
drop table if exists public.reports;
