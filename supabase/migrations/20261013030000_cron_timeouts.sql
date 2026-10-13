-- Cron HTTP calls without timeout_milliseconds were cut by pg_net's short default,
-- long before a multi-index scan finished. Applied with `supabase db query --linked`.
do $$
declare j record;
begin
  for j in select jobid, command from cron.job
           where command like '%net.http_post%' and command not like '%timeout_milliseconds%'
  loop
    perform cron.alter_job(j.jobid, command := replace(j.command, '''{}''::jsonb)', '''{}''::jsonb, timeout_milliseconds := 300000)'));
  end loop;
end $$;
