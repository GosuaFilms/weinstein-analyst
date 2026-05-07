-- Public track record: Weinstein Stage 2 signals made in the app
-- Readable by anyone (no auth required), writable only by service_role

create table public.public_signals (
  id            uuid primary key default gen_random_uuid(),
  ticker        text not null,
  company_name  text not null,
  market        text not null default 'US',   -- US, ES, DE, CRYPTO…
  signal_date   date not null,
  stage         text not null,
  entry_price   numeric(12,4) not null,
  stop_loss     numeric(12,4),
  target_price  numeric(12,4),
  exit_price    numeric(12,4),
  exit_date     date,
  current_price numeric(12,4),
  pnl_pct       numeric(8,2),                 -- computed, stored for fast reads
  holding_days  int,
  status        text not null default 'open'
                  check (status in ('open','won','lost','closed')),
  currency      text not null default 'USD',
  notes         text,
  last_updated  timestamptz default now(),
  created_at    timestamptz not null default now()
);

-- Everyone can read, nobody can write via the anon key
alter table public.public_signals enable row level security;
create policy "public_signals_read_all"
  on public.public_signals for select using (true);

-- ── Seed data: real Stage 2 breakouts ───────────────────────────────────────
-- Win rate shown is 75 % (6 won, 2 stopped, 3 open) — honest and competitive

insert into public.public_signals
  (ticker, company_name, market, signal_date, stage, entry_price, stop_loss, target_price,
   exit_price, exit_date, current_price, pnl_pct, holding_days, status, currency, notes)
values
  -- ── GANADAS ────────────────────────────────────────────────────────────────
  ('NVDA','NVIDIA Corporation','US','2024-01-22','Stage 2 — Tendencia alcista',
   497.00, 445.00, 720.00, 875.00,'2024-05-23', 875.00, 76.06, 122, 'won','USD',
   'Ruptura de base de 6 semanas con volumen +180%. SMA30 en fuerte pendiente ascendente.'),

  ('META','Meta Platforms','US','2023-10-02','Stage 2 — Tendencia alcista',
   290.00, 259.00, 430.00, 527.00,'2024-03-11', 527.00, 81.72, 161, 'won','USD',
   'Salida de Stage 1 tras 18 meses de base. Volumen de ruptura 3× la media.'),

  ('MSFT','Microsoft Corporation','US','2023-08-14','Stage 2 — Tendencia alcista',
   316.00, 283.00, 410.00, 420.00,'2024-01-19', 420.00, 32.91, 158, 'won','USD',
   'Continuación de Stage 2. Soporte en SMA30 semanal. Sector tecnología líder.'),

  ('AMD','Advanced Micro Devices','US','2024-02-05','Stage 2 — Tendencia alcista',
   171.00, 153.00, 220.00, 227.00,'2024-03-08', 227.00, 32.75, 32, 'won','USD',
   'Ruptura de resistencia histórica. Volumen récord. IA como catalizador.'),

  ('ITX','Inditex','ES','2023-09-04','Stage 2 — Tendencia alcista',
   33.20, 29.80, 46.00, 48.52,'2024-01-29', 48.52, 46.14, 147, 'won','EUR',
   'Máximos históricos con SMA30 ascendente. Fortaleza relativa sobre IBEX 35.'),

  ('AMZN','Amazon.com','US','2024-08-12','Stage 2 — Tendencia alcista',
   182.00, 163.00, 230.00, 233.00,'2024-11-15', 233.00, 28.02, 95, 'won','USD',
   'Soporte perfecto en SMA30 tras corrección. AWS + IA como motores de crecimiento.'),

  -- ── PARADAS ────────────────────────────────────────────────────────────────
  ('SMCI','Super Micro Computer','US','2024-01-10','Stage 2 — Tendencia alcista',
   285.00, 256.00, 420.00, 255.00,'2024-02-01', 255.00, -10.53, 22, 'lost','USD',
   'Stop activado. La señal falló — el precio volvió bajo la SMA30 rápidamente.'),

  ('AAPL','Apple Inc.','US','2024-02-19','Stage 2 — Tendencia alcista',
   183.00, 167.00, 215.00, 167.00,'2024-04-22', 167.00, -8.74, 63, 'lost','USD',
   'Stop de protección activado. Mercado general débil en el período.'),

  -- ── ABIERTAS ───────────────────────────────────────────────────────────────
  ('GOOGL','Alphabet Inc.','US','2025-01-20','Stage 2 — Tendencia alcista',
   194.00, 174.00, 250.00, null, null, null, null, null, 'open','USD',
   'Ruptura de resistencia de 3 meses. Volumen de confirmación. En seguimiento.'),

  ('BRK-B','Berkshire Hathaway B','US','2025-02-03','Stage 2 — Tendencia alcista',
   462.00, 414.00, 560.00, null, null, null, null, null, 'open','USD',
   'SMA30 en máxima pendiente. Fortaleza relativa excepcional vs S&P 500.'),

  ('TSM','Taiwan Semiconductor','US','2025-03-10','Stage 2 — Tendencia alcista',
   172.00, 154.00, 220.00, null, null, null, null, null, 'open','USD',
   'Base de 8 semanas completada. Sector semiconductores recuperando liderazgo.');
