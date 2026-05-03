// GET /functions/v1/backtest?ticker=AAPL
// Fetches 2 years of weekly closes from Yahoo Finance, applies rolling SMA30,
// classifies each week as Stage 2 or not, and returns all Stage 2 periods
// with their entry/exit prices, return %, duration and — for the active entry —
// Weinstein price targets derived from the preceding base pattern.

import { handleCors, jsonResponse } from '../_shared/cors.ts';

export interface Stage2Period {
  entryDate: string;       // ISO date string
  entryPrice: number;
  exitDate: string | null; // null = still active
  exitPrice: number | null;
  returnPct: number;       // (exit - entry) / entry * 100, or (now - entry) / entry * 100
  weeksInStage2: number;
  active: boolean;
}

/** Weinstein price targets computed from the Stage 1 base pattern. */
export interface PriceTargets {
  baseHigh: number;     // Highest close during the base lookback
  baseLow: number;      // Lowest close during the base lookback
  baseHeight: number;   // baseHigh - baseLow
  baseWidthWeeks: number;
  stopProxy: number;    // SMA30 at entry — recommended reference stop level
  target1: number;      // Entry + 1× height  (conservative Weinstein target)
  target2: number;      // Entry + 1.618× height (Fibonacci extension)
  target3: number;      // Entry + 2× height  (extended move target)
  rrT1: number;         // Risk-Reward ratio to T1  (T1-entry)/(entry-stop)
  progressPct: number;  // How far current price has moved from entry toward T1 (%)
  reachedT1: boolean;
  reachedT2: boolean;
  reachedT3: boolean;
}

export interface BacktestResult {
  ticker: string;
  currentPrice: number;
  periods: Stage2Period[];
  winRate: number;          // % of completed periods with positive return
  avgReturn: number;        // average return across all periods
  activeEntry: Stage2Period | null;
  priceTargets: PriceTargets | null; // Only computed when activeEntry exists
}

function sma(closes: number[], i: number, period: number): number | null {
  if (i < period - 1) return null;
  const slice = closes.slice(i - period + 1, i + 1);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function computePriceTargets(
  closePrices: number[],
  entryIdx: number,
  entryPrice: number,
  currentPrice: number,
  smaPeriod: number,
): PriceTargets {
  // Look back up to 52 weeks from entry to capture the Stage 1 base
  const lookbackStart = Math.max(0, entryIdx - 52);
  const baseCloses = closePrices.slice(lookbackStart, entryIdx + 1);

  const baseHigh = Math.max(...baseCloses);
  const baseLow  = Math.min(...baseCloses);
  const baseHeight = baseHigh - baseLow;
  const baseWidthWeeks = entryIdx - lookbackStart;

  // Use SMA30 at entry as the reference stop level
  const smaAtEntry = sma(closePrices, entryIdx, smaPeriod) ?? entryPrice * 0.93;
  const stopProxy = smaAtEntry;

  const target1 = entryPrice + baseHeight;
  const target2 = entryPrice + baseHeight * 1.618;
  const target3 = entryPrice + baseHeight * 2;

  const risk = entryPrice - stopProxy;
  const rrT1 = risk > 0 ? (target1 - entryPrice) / risk : 0;

  // Progress from entry toward T1 (capped at 100%)
  const totalMove = target1 - entryPrice;
  const actualMove = currentPrice - entryPrice;
  const progressPct = totalMove > 0 ? Math.min(100, Math.max(0, (actualMove / totalMove) * 100)) : 0;

  return {
    baseHigh:       +baseHigh.toFixed(2),
    baseLow:        +baseLow.toFixed(2),
    baseHeight:     +baseHeight.toFixed(2),
    baseWidthWeeks,
    stopProxy:      +stopProxy.toFixed(2),
    target1:        +target1.toFixed(2),
    target2:        +target2.toFixed(2),
    target3:        +target3.toFixed(2),
    rrT1:           +rrT1.toFixed(2),
    progressPct:    +progressPct.toFixed(1),
    reachedT1:      currentPrice >= target1,
    reachedT2:      currentPrice >= target2,
    reachedT3:      currentPrice >= target3,
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const ticker = new URL(req.url).searchParams.get('ticker')?.toUpperCase();
  if (!ticker) return jsonResponse({ error: 'ticker required' }, 400);

  try {
    // 2 years of weekly data from Yahoo Finance
    const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
      `?interval=1wk&range=2y`;
    const res = await fetch(yUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return jsonResponse({ error: 'market data unavailable' }, 502);

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return jsonResponse({ error: 'no data' }, 404);

    const timestamps: number[] = result.timestamp ?? [];
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];

    // Filter out null/NaN closes
    const data: { ts: number; close: number }[] = timestamps
      .map((ts, i) => ({ ts, close: closes[i] }))
      .filter(d => d.close != null && !isNaN(d.close));

    if (data.length < 35) return jsonResponse({ error: 'not enough history' }, 422);

    const closePrices = data.map(d => d.close);
    const SMA_PERIOD     = 30;
    const SLOPE_LOOKBACK = 4;

    // Classify each week
    type WeekClass = 'STAGE_2' | 'OTHER';
    const classifications: WeekClass[] = data.map((_, i) => {
      const s     = sma(closePrices, i, SMA_PERIOD);
      const sPrev = sma(closePrices, i - SLOPE_LOOKBACK, SMA_PERIOD);
      if (!s || !sPrev) return 'OTHER';
      const price    = closePrices[i];
      const smaRising = s > sPrev;
      return price > s && smaRising ? 'STAGE_2' : 'OTHER';
    });

    const currentPrice = closePrices[closePrices.length - 1];

    // Find Stage 2 periods (entry = first week classified S2, exit = first week back to OTHER)
    const periods: Stage2Period[] = [];
    let inStage2  = false;
    let entryIdx  = -1;

    for (let i = 0; i < classifications.length; i++) {
      const cls = classifications[i];
      if (!inStage2 && cls === 'STAGE_2') {
        inStage2 = true;
        entryIdx = i;
      } else if (inStage2 && cls !== 'STAGE_2') {
        const entryPrice = data[entryIdx].close;
        const exitPrice  = data[i - 1].close;
        periods.push({
          entryDate:     new Date(data[entryIdx].ts * 1000).toISOString().split('T')[0],
          entryPrice,
          exitDate:      new Date(data[i - 1].ts * 1000).toISOString().split('T')[0],
          exitPrice,
          returnPct:     +((exitPrice - entryPrice) / entryPrice * 100).toFixed(2),
          weeksInStage2: i - entryIdx,
          active:        false,
        });
        inStage2 = false;
        entryIdx = -1;
      }
    }

    // Still in Stage 2 at end of data
    if (inStage2 && entryIdx !== -1) {
      const entryPrice = data[entryIdx].close;
      periods.push({
        entryDate:     new Date(data[entryIdx].ts * 1000).toISOString().split('T')[0],
        entryPrice,
        exitDate:      null,
        exitPrice:     null,
        returnPct:     +((currentPrice - entryPrice) / entryPrice * 100).toFixed(2),
        weeksInStage2: data.length - entryIdx,
        active:        true,
      });
    }

    const completed = periods.filter(p => !p.active);
    const winRate   = completed.length > 0
      ? +(completed.filter(p => p.returnPct > 0).length / completed.length * 100).toFixed(1)
      : 0;
    const avgReturn = periods.length > 0
      ? +(periods.reduce((s, p) => s + p.returnPct, 0) / periods.length).toFixed(2)
      : 0;
    const activeEntry = periods.find(p => p.active) ?? null;

    // Compute price targets only for the active Stage 2 entry
    const priceTargets: PriceTargets | null = (activeEntry && entryIdx !== -1)
      ? computePriceTargets(closePrices, entryIdx, activeEntry.entryPrice, currentPrice, SMA_PERIOD)
      : null;

    const payload: BacktestResult = {
      ticker,
      currentPrice,
      periods,
      winRate,
      avgReturn,
      activeEntry,
      priceTargets,
    };

    return jsonResponse(payload);
  } catch (err) {
    console.error('[backtest]', err);
    return jsonResponse({ error: 'internal error' }, 500);
  }
});
