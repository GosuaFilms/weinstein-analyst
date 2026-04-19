# Alpha Stage — Weinstein Pro Terminal

Professional trading terminal implementing **Stan Weinstein's Stage Analysis** methodology with real-time market data, AI-powered analysis, and realtime alerts.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  React + Vite + TS + Tailwind  →  Vercel       │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Supabase                                       │
│    • Auth (email/password)                      │
│    • Postgres (profiles, analyses, alerts)      │
│    • Realtime (live alert push)                 │
│    • Edge Functions (Deno)                      │
│    • pg_cron (alert check every 5 min)          │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  External APIs                                  │
│    • Finnhub (live prices, SMA, volume)         │
│    • Gemini 2.5 (Weinstein analysis)            │
└─────────────────────────────────────────────────┘
```

### Why not call Gemini from the browser?

The original Google AI Studio export called Gemini directly from the browser and asked it to "find the live price via Google Search". That's the root cause of stale prices — Google Search indexes quotes with 5–60 min lag.

This rebuild:
1. **Fetches the real price** from Finnhub (institutional-grade feed).
2. **Computes SMA30 weekly** and volume ratio **in code** — not by asking an LLM.
3. **Classifies the Weinstein stage** with deterministic rules first.
4. **Uses Gemini** only for the narrative layer (strategy, wording) — anchored to the real numbers.

---

## 1. Prerequisites

- Node.js 20+
- npm
- A [GitHub](https://github.com) account
- A [Supabase](https://supabase.com) account (free tier works)
- A [Vercel](https://vercel.com) account (free tier works)
- A [Finnhub](https://finnhub.io/register) API key (free tier: 60 req/min)
- A [Gemini](https://aistudio.google.com/apikey) API key (free tier available)
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started): `npm install -g supabase`

---

## 2. Local setup

```bash
cd /Users/juantxu/Projects/weinstein-analyst
npm install
cp .env.example .env
# Edit .env and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

---

## 3. Supabase setup

### 3.1 Create the project

1. Go to https://supabase.com/dashboard → **New project**.
2. Note your project ref (the `xxxx` in `xxxx.supabase.co`) and database password.

### 3.2 Link the CLI

```bash
cd /Users/juantxu/Projects/weinstein-analyst
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

### 3.3 Apply the schema

```bash
supabase db push
```

This creates all tables, RLS policies, realtime publications, and the 5-minute cron job.

### 3.4 Configure secrets for Edge Functions

```bash
supabase secrets set GEMINI_API_KEY=AIza...
supabase secrets set FINNHUB_API_KEY=cq...
supabase secrets set CRON_SECRET=$(openssl rand -hex 32)
```

### 3.5 Deploy Edge Functions

```bash
supabase functions deploy get-live-price
supabase functions deploy analyze-market
supabase functions deploy analyze-operation
supabase functions deploy chat
supabase functions deploy check-alerts --no-verify-jwt
```

### 3.6 Wire pg_cron to call `check-alerts`

Open Supabase Dashboard → **SQL Editor** and run:

```sql
alter database postgres set "app.supabase_url" to 'https://YOUR_PROJECT_REF.supabase.co';
alter database postgres set "app.cron_secret" to 'THE_SECRET_YOU_GENERATED_ABOVE';
```

### 3.7 Get your frontend keys

Supabase Dashboard → **Project Settings → API**:
- `Project URL` → paste into `VITE_SUPABASE_URL`
- `anon public` key → paste into `VITE_SUPABASE_ANON_KEY`

---

## 4. GitHub + Vercel deploy

### 4.1 Push to GitHub

```bash
cd /Users/juantxu/Projects/weinstein-analyst
git init
git add .
git commit -m "Initial professional rebuild"
gh repo create weinstein-analyst --public --source=. --push
```

### 4.2 Connect Vercel

1. Go to https://vercel.com/new → import `weinstein-analyst`.
2. Framework preset: **Vite** (auto-detected).
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy.

Every `git push` now triggers a Vercel rebuild automatically.

---

## 5. Project structure

```
weinstein-analyst/
├── src/
│   ├── components/      # UI (preserved from original)
│   ├── contexts/        # AuthContext (Supabase auth)
│   ├── hooks/           # useAnalyses, useAlerts (+ realtime)
│   ├── lib/
│   │   ├── supabase.ts  # browser client
│   │   └── api.ts       # typed wrapper for Edge Functions
│   ├── services/
│   │   └── geminiService.ts  # back-compat shim → api.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── types.ts
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   └── 0001_initial_schema.sql
│   └── functions/
│       ├── _shared/
│       │   ├── cors.ts
│       │   ├── finnhub.ts     # Finnhub client + SMA/volume math
│       │   ├── gemini.ts      # lightweight REST client
│       │   └── weinstein.ts   # deterministic stage classifier
│       ├── get-live-price/
│       ├── analyze-market/
│       ├── analyze-operation/
│       ├── chat/
│       └── check-alerts/      # invoked by pg_cron
├── .env.example
├── vercel.json
└── package.json
```

---

## 6. How the real-time price flow works

**User types `AAPL` → clicks ANALYZE →**

1. Browser calls `supabase.functions.invoke('analyze-market', {...})`.
2. Edge Function calls Finnhub `/quote` → gets live price + timestamp (UNIX seconds, not a rumor).
3. Edge Function calls Finnhub `/stock/candle?resolution=W` → gets weekly candles.
4. Edge Function computes SMA30-weekly and volume ratio **in TypeScript**.
5. `weinstein.ts` classifies the stage using rules (not the LLM).
6. Gemini is called with a **"technical anchor"** block that forces it to use the real numbers — it only writes the narrative (strategy, wording, support/resistance phrasing).
7. The Edge Function **overwrites** `currentPrice` and `priceTimestamp` in Gemini's response with the Finnhub values, so the LLM can't invent numbers.

## 7. How realtime alerts work

1. User creates an alert → row inserted in `alerts` table.
2. `pg_cron` fires every 5 min → calls `check-alerts` Edge Function.
3. Edge Function skips if the US market is closed (unless `CHECK_ALERTS_ALWAYS=1`).
4. Groups alerts by ticker (1 Finnhub call per ticker, not per alert).
5. Evaluates each condition deterministically (no LLM).
6. On trigger: updates `alerts.status = 'triggered'` + inserts `alert_events` row.
7. Frontend is subscribed via Supabase Realtime → receives websocket push → shows browser Notification.

---

## 8. Local development tips

```bash
# Full local stack (runs Postgres + Edge runtime + Studio)
supabase start

# Test an Edge Function locally
supabase functions serve analyze-market --env-file supabase/.env.local

# Regenerate TS types from the DB schema
npm run supabase:types
```

---

## 9. Known limitations

- **Finnhub free tier** has no crypto real-time feed for all pairs — `BTCUSD` works via `BINANCE:BTCUSDT`, etc.
- **Candles** require a paid Finnhub plan for some exchanges; for free stocks on US exchanges (NYSE, NASDAQ) it works.
- The cron runs every 5 min (SQL-defined); if you need sub-minute alerts, move to a push-based WebSocket subscription (Finnhub supports it).

---

## 10. Roadmap

- [ ] Supabase Storage for chart uploads (currently images are base64-inlined)
- [ ] Price chart embedded in `AnalysisDisplay` using Finnhub candles + Recharts
- [ ] Stripe integration for Pro tier (unlimited alerts)
- [ ] Email notifications via Supabase → Resend
- [ ] Mobile PWA manifest

---

Built with Stan Weinstein's methodology. No financial advice — DYOR.
