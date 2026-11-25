-- Fewer, opt-in notifications:
--  • daily-brief (watchlist email) becomes opt-in and weekdays only
--  • daily-digest stops: the channel already gets the Stage 2 summary from stage2-daily
--  • weekly-report gets an opt-out (required for commercial email in Spain, LSSI art. 22)

alter table public.user_settings alter column daily_email_enabled set default false;
alter table public.user_settings add column if not exists weekly_report_enabled boolean not null default true;

select cron.unschedule('daily-digest-0700-utc')
where exists (select 1 from cron.job where jobname = 'daily-digest-0700-utc');

-- 07:00 UTC Mon–Fri (08:00 Madrid in winter); was every day at 08:00 UTC
select cron.alter_job(jobid, schedule := '0 7 * * 1-5')
from cron.job where jobname = 'daily-brief-8am';
