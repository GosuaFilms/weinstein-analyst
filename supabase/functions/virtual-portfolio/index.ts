// POST /functions/v1/virtual-portfolio
// Body: { currency?: 'EUR'|'USD', amount?: number, indices?: string[] }
//
// Generates a diversified virtual portfolio using the Stan Weinstein method.
// Only Stage 2 stocks (bullish trend) with medium/high confidence are selected.
// Position sizing is risk-based: each position risks ~1.5% of the portfolio
// using the Weinstein stop-loss level. Max 12 positions, max 12% per position.
//
// ⚠️  NOT INVESTMENT ADVICE — educational/illustrative only.

import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getTechnicalSnapshot } from '../_shared/marketData.ts';
import { classifyStage } from '../_shared/weinstein.ts';
import { INDICES } from '../_shared/indices.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CandidateStock {
  symbol: string;
  name: string;
  currency: string;
  currentPrice: number;
  confidence: 'low' | 'medium' | 'high';
  mansfieldRS: number | null;
  stopLoss: number | null;
  stopLossRiskPct: number | null;
  distanceFromSMA30Pct: number | null;
  extendedStage2: boolean;
  region: string;
  score: number;
}

export interface VirtualPosition {
  symbol: string;
  name: string;
  nativeCurrency: string;
  currentPrice: number;
  confidence: 'low' | 'medium' | 'high';
  mansfieldRS: number | null;
  stopLoss: number | null;
  stopLossRiskPct: number | null;
  distanceFromSMA30Pct: number | null;
  extendedStage2: boolean;
  region: string;
  allocationPct: number;
  allocationAmount: number;
  approxShares: number;
  positionRisk: number;
  positionRiskPct: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function pooledMap<T, R>(
  items: T[], concurrency: number, fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

function regionOf(symbol: string): string {
  const u = symbol.toUpperCase();
  if (u.endsWith('.MC')) return 'ES';
  if (u.endsWith('.DE') || u.endsWith('.F')) return 'DE';
  if (u.endsWith('.L')) return 'UK';
  if (u.endsWith('.PA') || u.endsWith('.AS') || u.endsWith('.BR') || u.endsWith('.LS')) return 'EU';
  if (u.endsWith('.T') || u.endsWith('.HK') || u.endsWith('.AX') || u.endsWith('.TO')) return 'APAC';
  return 'US';
}

function scoreCandidate(c: CandidateStock): number {
  let s = 0;
  if (c.confidence === 'high') s += 30;
  else if (c.confidence === 'medium') s += 15;
  if (c.mansfieldRS !== null) {
    if (c.mansfieldRS > 1) s += 20;
    else if (c.mansfieldRS > 0) s += 10;
    else s -= 5;
  }
  if (c.extendedStage2) s -= 15; // Already extended, higher risk
  if (c.stopLossRiskPct !== null) {
    if (c.stopLossRiskPct < 6) s += 10;   // Tight stop = better R/R
    else if (c.stopLossRiskPct > 15) s -= 5; // Wide stop = worse R/R
  }
  if (c.distanceFromSMA30Pct !== null && c.distanceFromSMA30Pct > 0) {
    if (c.distanceFromSMA30Pct < 5) s += 8;   // Close to SMA30 = early stage 2
    else if (c.distanceFromSMA30Pct > 20) s -= 8; // Very extended
  }
  return s;
}

// ─── Portfolio construction ───────────────────────────────────────────────────

const MAX_POSITIONS = 12;
const MAX_PER_REGION = 4;
const RISK_PER_POSITION = 0.015; // 1.5% of portfolio per position
const MAX_POSITION_PCT = 0.12;   // 12% cap
const MIN_POSITION_PCT = 0.03;   // 3% floor
const CASH_RESERVE_TARGET = 0.15; // Keep ~15% in cash
const MIN_STOCK_PRICE = 2.0;      // Exclude penny stocks below this price

function buildPortfolio(
  candidates: CandidateStock[],
  portfolioAmount: number
): VirtualPosition[] {
  // Sort by score descending
  const sorted = [...candidates].sort((a, b) => b.score - a.score);

  // Select with regional diversification
  const selected: CandidateStock[] = [];
  const regionCount: Record<string, number> = {};

  for (const c of sorted) {
    if (selected.length >= MAX_POSITIONS) break;
    const region = c.region;
    const count = regionCount[region] ?? 0;
    if (count >= MAX_PER_REGION) continue;
    selected.push(c);
    regionCount[region] = count + 1;
  }

  if (selected.length === 0) return [];

  const investableAmount = portfolioAmount * (1 - CASH_RESERVE_TARGET);

  // Risk-based sizing: position_size = (portfolio * RISK_PCT) / (stopRiskPct/100)
  const rawAllocations = selected.map(c => {
    if (c.stopLossRiskPct && c.stopLossRiskPct > 0) {
      return (portfolioAmount * RISK_PER_POSITION) / (c.stopLossRiskPct / 100);
    }
    return investableAmount / selected.length;
  });

  // Normalise so total ≤ investableAmount, apply caps
  const rawTotal = rawAllocations.reduce((s, v) => s + v, 0);
  const scale = rawTotal > investableAmount ? investableAmount / rawTotal : 1;

  const capped = rawAllocations.map(v => {
    const scaled = v * scale;
    return Math.min(
      Math.max(scaled, portfolioAmount * MIN_POSITION_PCT),
      portfolioAmount * MAX_POSITION_PCT
    );
  });

  // Re-normalise after capping so we don't exceed investableAmount
  const cappedTotal = capped.reduce((s, v) => s + v, 0);
  const finalScale = cappedTotal > investableAmount ? investableAmount / cappedTotal : 1;

  return selected.map((c, i) => {
    const amount = capped[i] * finalScale;
    const pct = amount / portfolioAmount;
    const approxShares = c.currentPrice > 0 ? amount / c.currentPrice : 0;
    const posRisk = c.stopLossRiskPct
      ? amount * (c.stopLossRiskPct / 100)
      : amount * 0.08; // fallback: assume 8% stop
    const r2 = (v: number | null) => v !== null ? Math.round(v * 100) / 100 : null;
    return {
      symbol: c.symbol,
      name: c.name,
      nativeCurrency: c.currency,
      currentPrice: r2(c.currentPrice) ?? 0,
      confidence: c.confidence,
      // All percentages and prices rounded to 2 decimals
      mansfieldRS: r2(c.mansfieldRS),
      stopLoss: r2(c.stopLoss),
      stopLossRiskPct: r2(c.stopLossRiskPct),
      distanceFromSMA30Pct: r2(c.distanceFromSMA30Pct),
      extendedStage2: c.extendedStage2,
      region: c.region,
      allocationPct: Math.round(pct * 1000) / 10,
      allocationAmount: Math.round(amount * 100) / 100,
      // Integer shares for normal stocks, 2 decimals for sub-1 prices
      approxShares: c.currentPrice >= 1
        ? Math.floor(amount / c.currentPrice)
        : Math.round((amount / c.currentPrice) * 100) / 100,
      positionRisk: Math.round(posRisk * 100) / 100,
      // 2 decimal places for risk % (0.59 instead of 0.6)
      positionRiskPct: Math.round((posRisk / portfolioAmount) * 10000) / 100,
    };
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const {
      currency = 'EUR',
      amount = 100000,
      indices: requestedIndices,
    } = await req.json() as {
      currency?: string;
      amount?: number;
      indices?: string[];
    };

    // Default index selection by currency
    const defaultIndices = currency === 'EUR'
      ? ['IBEX35', 'DAX40', 'SP100']
      : ['SP100', 'NASDAQ50', 'IBEX35'];

    const indicesToScan = (requestedIndices ?? defaultIndices).filter(k => INDICES[k]);
    if (indicesToScan.length === 0) {
      return jsonResponse({ error: 'No valid indices specified.' }, 400);
    }

    const start = Date.now();

    // Collect unique tickers across all selected indices
    const tickerToRegion = new Map<string, string>();
    for (const idxKey of indicesToScan) {
      const idxDef = INDICES[idxKey];
      for (const t of idxDef.tickers) {
        if (!tickerToRegion.has(t)) tickerToRegion.set(t, idxDef.region);
      }
    }

    const uniqueTickers = [...tickerToRegion.keys()];

    // Scan all tickers with pooled concurrency
    const snapshots = await pooledMap(uniqueTickers, 8, async (ticker) => {
      try {
        const snap = await getTechnicalSnapshot(ticker);
        const cls = classifyStage(snap);
        return { ticker, snap, cls };
      } catch {
        return null;
      }
    });

    // Filter Stage 2 stocks with medium/high confidence
    const candidates: CandidateStock[] = [];
    for (const item of snapshots) {
      if (!item) continue;
      const { ticker, snap, cls } = item;
      if (cls.stage !== 'STAGE_2') continue;
      if (cls.confidence === 'low') continue;
      if (snap.currentPrice <= 0) continue;
      // Exclude penny stocks — minimum price filter
      if (snap.currentPrice < MIN_STOCK_PRICE) continue;

      const c: CandidateStock = {
        symbol: snap.symbol,
        name: snap.name,
        currency: snap.currency,
        currentPrice: snap.currentPrice,
        confidence: cls.confidence,
        mansfieldRS: snap.mansfieldRS,
        stopLoss: snap.suggestedStopLoss,
        stopLossRiskPct: snap.stopLossRiskPct,
        distanceFromSMA30Pct: snap.distanceFromSMA30Pct,
        extendedStage2: snap.extendedStage2,
        region: tickerToRegion.get(ticker) ?? regionOf(ticker),
        score: 0,
      };
      c.score = scoreCandidate(c);
      candidates.push(c);
    }

    const positions = buildPortfolio(candidates, amount);
    const totalAllocated = positions.reduce((s, p) => s + p.allocationAmount, 0);
    const cashReserve = amount - totalAllocated;
    const maxPortfolioRisk = positions.reduce((s, p) => s + p.positionRisk, 0);

    return jsonResponse({
      portfolioCurrency: currency,
      portfolioAmount: amount,
      scannedAt: new Date().toISOString(),
      duration: Math.round((Date.now() - start) / 1000),
      indicesScanned: indicesToScan,
      totalStage2Found: candidates.length,
      totalAllocated: Math.round(totalAllocated * 100) / 100,
      totalAllocatedPct: Math.round((totalAllocated / amount) * 1000) / 10,
      cashReserve: Math.round(cashReserve * 100) / 100,
      cashReservePct: Math.round((cashReserve / amount) * 1000) / 10,
      maxPortfolioRisk: Math.round(maxPortfolioRisk * 100) / 100,
      maxPortfolioRiskPct: Math.round((maxPortfolioRisk / amount) * 1000) / 10,
      positions,
      methodology: {
        riskPerPosition: `${RISK_PER_POSITION * 100}%`,
        maxPositions: MAX_POSITIONS,
        maxPerRegion: MAX_PER_REGION,
        cashReserveTarget: `${CASH_RESERVE_TARGET * 100}%`,
        stopLossMethod: 'Weinstein SMA30 / swing low',
      },
    });
  } catch (err) {
    console.error('virtual-portfolio error:', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
