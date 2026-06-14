// POST /functions/v1/watchlist-scan
// Body: { symbols: string[] }
// Scans a list of symbols live and returns Weinstein stage + alert level for each.
// Used by the WatchlistSidebar to enrich basic watchlist items with live data.

import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getTechnicalSnapshot } from '../_shared/marketData.ts';
import { classifyStage } from '../_shared/weinstein.ts';

export type AlertLevel =
  | 'RUPTURA'       // Stage 2, <5% above SMA30w (just broke out) 🚀
  | 'EN_TENDENCIA'  // Stage 2, established uptrend ✅
  | 'EXTENDIDA'     // Stage 2, >15% above SMA30w ⚠️
  | 'CERCA'         // Stage 1, <3% below SMA30w OR volume dry-up 👀
  | 'VIGILAR'       // Stage 1, 3–10% below SMA30w 📌
  | 'BASE'          // Stage 1, >10% below SMA30w ⏳
  | 'PRECAUCION'    // Stage 3 🔶
  | 'SALIDA';       // Stage 4 🔴

export interface ScannedItem {
  symbol: string;
  name: string;
  currency: string;
  currentPrice: number;
  stage: 'STAGE_1' | 'STAGE_2' | 'STAGE_3' | 'STAGE_4';
  confidence: 'low' | 'medium' | 'high';
  alert: AlertLevel;
  distanceFromSMA30Pct: number | null;
  mansfieldRS: number | null;
  suggestedStopLoss: number | null;
  stopLossRiskPct: number | null;
  atr14Weekly: number | null;
  volumeDryUp: boolean | null;
  multiMaAlignment: string | null;
  error?: string;
}

const ALERT_ORDER: Record<AlertLevel, number> = {
  RUPTURA: 0, CERCA: 1, VIGILAR: 2, EN_TENDENCIA: 3,
  EXTENDIDA: 4, BASE: 5, PRECAUCION: 6, SALIDA: 7,
};

function classifyAlert(
  stage: string,
  distanceFromSMA30Pct: number | null,
  extendedStage2: boolean,
  volumeDryUp: boolean | null,
): AlertLevel {
  const dist = distanceFromSMA30Pct ?? 0;
  if (stage === 'STAGE_2') {
    if (dist < 5) return 'RUPTURA';
    if (extendedStage2) return 'EXTENDIDA';
    return 'EN_TENDENCIA';
  }
  if (stage === 'STAGE_1') {
    const gap = Math.abs(dist);
    if (volumeDryUp || gap < 3) return 'CERCA';
    if (gap < 10) return 'VIGILAR';
    return 'BASE';
  }
  if (stage === 'STAGE_3') return 'PRECAUCION';
  if (stage === 'STAGE_4') return 'SALIDA';
  return 'BASE';
}

async function pooledMap<T, R>(
  items: T[], concurrency: number, fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) { const i = idx++; results[i] = await fn(items[i]); }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { symbols } = await req.json() as { symbols: string[] };
    if (!Array.isArray(symbols) || symbols.length === 0) return jsonResponse({ items: [] });

    const deduped = [...new Set(symbols.map(s => s.toUpperCase()))].slice(0, 30);

    const items = await pooledMap<string, ScannedItem>(deduped, 6, async (symbol) => {
      try {
        const snap = await getTechnicalSnapshot(symbol);
        const cls = classifyStage(snap);
        const alert = classifyAlert(cls.stage, snap.distanceFromSMA30Pct, snap.extendedStage2, snap.volumeDryUp);
        const r2 = (v: number | null | undefined) => v != null ? Math.round(v * 100) / 100 : null;
        const r1 = (v: number | null | undefined) => v != null ? Math.round(v * 10) / 10 : null;
        return {
          symbol: snap.symbol,
          name: snap.name,
          currency: snap.currency,
          currentPrice: r2(snap.currentPrice) ?? 0,
          stage: cls.stage,
          confidence: cls.confidence,
          alert,
          distanceFromSMA30Pct: r1(snap.distanceFromSMA30Pct),
          mansfieldRS: r2(snap.mansfieldRS),
          suggestedStopLoss: r2(snap.suggestedStopLoss),
          stopLossRiskPct: r1(snap.stopLossRiskPct),
          atr14Weekly: r2(snap.atr14Weekly),
          volumeDryUp: snap.volumeDryUp,
          multiMaAlignment: snap.multiMaAlignment,
        };
      } catch (e) {
        return {
          symbol,
          name: symbol,
          currency: '',
          currentPrice: 0,
          stage: 'STAGE_1' as const,
          confidence: 'low' as const,
          alert: 'BASE' as const,
          distanceFromSMA30Pct: null,
          mansfieldRS: null,
          suggestedStopLoss: null,
          stopLossRiskPct: null,
          atr14Weekly: null,
          volumeDryUp: null,
          multiMaAlignment: null,
          error: (e as Error).message,
        };
      }
    });

    items.sort((a, b) => ALERT_ORDER[a.alert] - ALERT_ORDER[b.alert]);

    return jsonResponse({ items, scannedAt: new Date().toISOString() });
  } catch (err) {
    console.error('watchlist-scan error:', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
