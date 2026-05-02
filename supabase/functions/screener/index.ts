// POST /functions/v1/screener
// Body: { index: 'IBEX35'|'SP100'|'NASDAQ50'|'DAX40', smaPeriod?: number }
// Scans all tickers in the chosen index, classifies Weinstein stage for each,
// and returns sorted results (Stage 2 first — best buy signals).

import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getTechnicalSnapshot } from '../_shared/marketData.ts';
import { classifyStage } from '../_shared/weinstein.ts';

// ─── Index ticker lists ────────────────────────────────────────────────────

const INDICES: Record<string, { label: string; tickers: string[] }> = {
  IBEX35: {
    label: 'IBEX 35',
    tickers: [
      'ACS.MC','ACX.MC','AENA.MC','AMS.MC','ANA.MC','BBVA.MC','BKT.MC',
      'CABK.MC','COL.MC','ENG.MC','ELE.MC','FER.MC','GRF.MC','IAG.MC',
      'IBE.MC','IDR.MC','ITX.MC','LOG.MC','MAP.MC','MEL.MC','MRL.MC',
      'NTGY.MC','PHM.MC','RED.MC','REP.MC','ROVI.MC','SAB.MC','SAN.MC',
      'SCYR.MC','SLR.MC','TEF.MC','UNI.MC','VIS.MC','AMP.MC','CLNX.MC',
    ],
  },
  SP100: {
    label: 'S&P 100',
    tickers: [
      'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','JPM',
      'LLY','V','UNH','XOM','MA','JNJ','PG','COST','HD','ABBV','BAC',
      'KO','WMT','MRK','NFLX','CVX','CRM','AMD','ORCL','LIN','ACN',
      'MCD','CSCO','PEP','ABT','TXN','ADBE','AMGN','GE','CAT','NOW',
      'INTU','QCOM','GS','RTX','HON','BKNG','MS','DE','ISRG','PFE',
    ],
  },
  NASDAQ50: {
    label: 'NASDAQ 50',
    tickers: [
      'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','COST',
      'NFLX','AMD','ADBE','CSCO','INTU','QCOM','TXN','AMGN','ISRG',
      'BKNG','MU','LRCX','KLAC','MRVL','PANW','SNPS','CDNS','ADI',
      'CRWD','FTNT','MELI','ASML','AZN','PDD','REGN','GILD','VRTX',
      'MDLZ','CHTR','MAR','ABNB','ORLY','WDAY','CTAS','DXCM','IDXX',
      'BIIB','ILMN','SIRI','ZM',
    ],
  },
  DAX40: {
    label: 'DAX 40',
    tickers: [
      'ADS.DE','AIR.DE','ALV.DE','BAS.DE','BAYN.DE','BMW.DE','BNR.DE',
      'CON.DE','DB1.DE','DBK.DE','DHL.DE','DTE.DE','EOAN.DE','FRE.DE',
      'HEI.DE','HEN3.DE','IFX.DE','LIN.DE','MBG.DE','MRK.DE','MTX.DE',
      'MUV2.DE','P911.DE','PUM.DE','QIA.DE','RHM.DE','RWE.DE','SAP.DE',
      'SHL.DE','SIE.DE','SRT3.DE','VNA.DE','VOW3.DE','WCH.DE','ZAL.DE',
      'ENR.DE','HNR1.DE','1COV.DE','SY1.DE','AFX.DE',
    ],
  },
};

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
