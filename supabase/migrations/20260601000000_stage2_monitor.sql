-- ─── Stage 2 Monitor ──────────────────────────────────────────────────────────
-- Stores daily Stage 2 snapshots per index so we can detect entries/exits.

CREATE TABLE IF NOT EXISTS stage2_snapshots (
  id              bigserial PRIMARY KEY,
  scan_date       date        NOT NULL,
  index_id        text        NOT NULL,
  symbol          text        NOT NULL,
  name            text        NOT NULL,
  currency        text,
  current_price   numeric,
  confidence      text,
  sma30           numeric,
  distance_pct    numeric,
  mansfield_rs    numeric,
  volume_ratio    numeric,
  extended        boolean     DEFAULT false,
  stop_loss       numeric,
  stop_risk_pct   numeric,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(scan_date, index_id, symbol)
);

-- Index for fast daily queries
CREATE INDEX IF NOT EXISTS idx_stage2_date_index
  ON stage2_snapshots(scan_date DESC, index_id);

-- RLS: users can read all snapshots (public market data)
ALTER TABLE stage2_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read stage2 snapshots"
  ON stage2_snapshots FOR SELECT USING (true);
CREATE POLICY "service role can insert stage2 snapshots"
  ON stage2_snapshots FOR INSERT WITH CHECK (true);

-- ─── Cron: run daily at 22:00 UTC (after US market close) ─────────────────────
select cron.schedule(
  'stage2-daily-scan-2200-utc',
  '0 22 * * 1-5',   -- Mon–Fri at 22:00 UTC (after NYSE close)
  $$
  select net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/stage2-daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body    := '{}'::jsonb
  ) as request_id;
  $$
);
