-- Entry rules from 2026-11-27: weekly confirmation, positive RS, market not in Stage 4.
-- The scan stores the market's stage; signals keep the breakout-week volume.
alter table public.stage2_snapshots add column if not exists benchmark_stage text;
alter table public.track_signals add column if not exists volume_ratio numeric;
alter table public.track_signals add column if not exists benchmark_stage text;
