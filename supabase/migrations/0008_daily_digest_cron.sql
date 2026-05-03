-- Daily digest cron job — runs at 07:00 UTC (09:00 Madrid / CET)
-- Sends Stage 2 summary to all users with Telegram / email notifications.
-- Requires app.supabase_url and app.cron_secret DB settings (set in 0001).
select cron.schedule(
  'daily-digest-0700-utc',
  '0 7 * * 1-5',   -- Mon–Fri at 07:00 UTC (skips weekends)
  $$
  select net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/daily-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body    := '{}'::jsonb
  ) as request_id;
  $$
);
