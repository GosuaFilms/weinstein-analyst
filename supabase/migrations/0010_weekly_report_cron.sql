-- Weekly Weinstein report cron job
-- Runs every Saturday at 07:00 UTC (08:00 Madrid CET / 09:00 CEST).
-- Sends a full market report — indices, sectors, macro, top Stage 2 — via Telegram + email.
select cron.schedule(
  'weekly-report-saturday-0700-utc',
  '0 7 * * 6',   -- Every Saturday at 07:00 UTC
  $$
  select net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/weekly-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body    := '{}'::jsonb
  ) as request_id;
  $$
);
