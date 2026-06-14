// POST /functions/v1/screener
// Body: { index: 'IBEX35'|'SP100'|'NASDAQ50'|'DAX40', smaPeriod?: number }
// Scans all tickers in the chosen index, classifies Weinstein stage for each,
// and returns sorted results (Stage 2 first — best buy signals).

import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getTechnicalSnapshot } from '../_shared/marketData.ts';
import { classifyStage } from '../_shared/weinstein.ts';
import { INDICES } from '../_shared/indices.ts';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ScreenerItem {
  symbol: string;
  name: string;
  currency: string;
  currentPrice: number;
  stage: 'STAGE_1' | 'STAGE_2' | 'STAGE_3' | 'STAGE_4';
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
  sma30: number | null;
  distanceFromSMA30Pct: number | null;
  sma30Trend: string | null;
  mansfieldRS: number | null;
  mansfieldRSTrend: string | null;
  volumeRatio: number | null;
  extendedStage2: boolean;
  benchmarkStage: string | null;
  suggestedStopLoss: number | null;
  stopLossRiskPct: number | null;
  error?: string;
}

// ─── Concurrency helper ────────────────────────────────────────────────────

async function pooledMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
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

// ─── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { index = 'IBEX35', smaPeriod = 30 } = await req.json() as {
      index?: string;
      smaPeriod?: number;
    };

    const indexDef = INDICES[index];
    if (!indexDef) {
      return jsonResponse({ error: `Unknown index "${index}". Valid: ${Object.keys(INDICES).join(', ')}` }, 400);
    }

    const start = Date.now();

    const results = await pooledMap<string, ScreenerItem>(
      indexDef.tickers,
      8, // max 8 concurrent Yahoo requests
      async (ticker) => {
        try {
          const snap = await getTechnicalSnapshot(ticker, smaPeriod);
          const cls = classifyStage(snap);
          return {
            symbol: snap.symbol,
            name: snap.name,
            currency: snap.currency,
            currentPrice: snap.currentPrice,
            stage: cls.stage,
            confidence: cls.confidence,
            reasoning: cls.reasoning,
            sma30: snap.sma30Weekly,
            distanceFromSMA30Pct: snap.distanceFromSMA30Pct,
            sma30Trend: snap.sma30Trend,
            mansfieldRS: snap.mansfieldRS,
            mansfieldRSTrend: snap.mansfieldRSTrend,
            volumeRatio: snap.volumeRatio,
            extendedStage2: snap.extendedStage2,
            benchmarkStage: snap.benchmarkStage,
            suggestedStopLoss: snap.suggestedStopLoss,
            stopLossRiskPct: snap.stopLossRiskPct,
          };
        } catch (e) {
          return {
            symbol: ticker,
            name: ticker,
            currency: '',
            currentPrice: 0,
            stage: 'STAGE_1' as const,
            confidence: 'low' as const,
            reasoning: '',
            sma30: null,
            distanceFromSMA30Pct: null,
            sma30Trend: null,
            mansfieldRS: null,
            mansfieldRSTrend: null,
            volumeRatio: null,
            extendedStage2: false,
            benchmarkStage: null,
            suggestedStopLoss: null,
            stopLossRiskPct: null,
            error: (e as Error).message,
          };
        }
      }
    );

    // Sort: Stage 2 high confidence first, then Stage 1, Stage 3, Stage 4
    const stageOrder = { STAGE_2: 0, STAGE_1: 1, STAGE_3: 2, STAGE_4: 3 };
    const confOrder = { high: 0, medium: 1, low: 2 };
    const sorted = results
      .filter(r => !r.error)
      .sort((a, b) => {
        const so = stageOrder[a.stage] - stageOrder[b.stage];
        if (so !== 0) return so;
        return confOrder[a.confidence] - confOrder[b.confidence];
      });

    const failed = results.filter(r => r.error).map(r => r.symbol);

    return jsonResponse({
      index,
      label: indexDef.label,
      scannedAt: new Date().toISOString(),
      duration: Math.round((Date.now() - start) / 1000),
      total: sorted.length,
      failed: failed.length > 0 ? failed : undefined,
      results: sorted,
    });
  } catch (err) {
    console.error('screener error:', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
