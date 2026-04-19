// POST /functions/v1/analyze-market
// Body: { ticker?: string, images?: Array<{data:string, mimeType:string}>, settings: Settings }
// Returns: AnalysisResult with real-time price + Weinstein analysis

import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getTechnicalSnapshot, type TechnicalSnapshot } from '../_shared/marketData.ts';
import { classifyStage } from '../_shared/weinstein.ts';
import { generate, extractJson } from '../_shared/gemini.ts';

interface Settings {
  smaPeriod: number;
  volumeMultiplier: number;
  language: 'es' | 'en';
}

interface AnalysisResult {
  companyName?: string;
  tickerSymbol?: string;
  currentPrice: string;
  priceTimestamp: string;
  stage: string;
  sma30Analysis: string;
  relativeStrength: string;
  volumeAnalysis: string;
  support: string;
  resistance: string;
  entryPrice: string;
  stopLoss: string;
  verdict: string;
  verdictType: 'BUY' | 'SELL' | 'WAIT' | 'CLOSE';
  suggestedStrategy: string;
  technicalSnapshot?: TechnicalSnapshot;
}

function buildSystemInstruction(lang: 'es' | 'en', snap: TechnicalSnapshot | null, stageHint: string): string {
  const langName = lang === 'es' ? 'Spanish' : 'English';
  const anchor = snap
    ? `
REAL-TIME TECHNICAL ANCHOR (source: Finnhub — DO NOT invent prices):
- Symbol: ${snap.symbol} (${snap.name})
- Current price: ${snap.currentPrice} ${snap.currency}
- Price timestamp: ${snap.priceTimestamp}
- Change: ${snap.change} (${snap.changePercent}%)
- Day range: ${snap.dayLow} — ${snap.dayHigh}
- Previous close: ${snap.previousClose}
- SMA30 (weekly): ${snap.sma30Weekly ?? 'N/A'}
- Distance from SMA30: ${snap.distanceFromSMA30Pct?.toFixed(2) ?? 'N/A'}%
- Weekly volume ratio vs 30-week avg: ${snap.volumeRatio?.toFixed(2) ?? 'N/A'}x
- 52-week high / low: ${snap.weekly52High ?? 'N/A'} / ${snap.weekly52Low ?? 'N/A'}
- Mansfield Relative Strength vs ${snap.benchmarkName ?? 'benchmark'} (${snap.benchmarkSymbol ?? 'N/A'}): ${snap.mansfieldRS?.toFixed(2) ?? 'N/A'} (prev week: ${snap.mansfieldRSPrev?.toFixed(2) ?? 'N/A'}) — positive = outperforming, negative = underperforming, trend = ${
    snap.mansfieldRS != null && snap.mansfieldRSPrev != null
      ? (snap.mansfieldRS > snap.mansfieldRSPrev ? 'rising' : 'falling')
      : 'N/A'
  }
- Rule-based stage hint: ${stageHint}

You MUST use exactly these numbers — do not substitute them with search results.
`
    : 'No live data anchor available (chart-only analysis). Use the charts to estimate stage.';

  return `You are a professional financial analyst specialized strictly in Stan Weinstein's Stage Analysis.
${anchor}

Output STRICT JSON in ${langName} with this exact schema:
{
  "companyName": "Full company name",
  "tickerSymbol": "Official ticker",
  "currentPrice": "Price with currency symbol (use the REAL-TIME value above)",
  "priceTimestamp": "Human-readable timestamp from the anchor",
  "stage": "Detailed stage label (e.g., 'Etapa 2A — Avance')",
  "sma30Analysis": "MA relationship analysis using the SMA30 value above",
  "relativeStrength": "Fuerza Relativa Mansfield — cite the numeric Mansfield RS from the anchor, name the benchmark, state whether it is positive/negative and rising/falling, and what that implies per Weinstein (Stage 2 requires RS > 0 and rising; Stage 4 typically RS < 0 and falling).",
  "volumeAnalysis": "Volume profile using the volume ratio above",
  "support": "Support level (numeric, in currency)",
  "resistance": "Resistance level (numeric, in currency)",
  "entryPrice": "Entry trigger level",
  "stopLoss": "Protection stop-loss level",
  "verdict": "Short action phrase",
  "verdictType": "BUY | SELL | WAIT | CLOSE",
  "suggestedStrategy": "Concrete execution plan (2-4 sentences)"
}
Rules:
- NEVER invent prices. Always use the anchor.
- NEVER average prices or use stale 'previous close' as current.
- Keep support/resistance numeric only (no text).`;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json();
    const { ticker, images, settings } = body as {
      ticker?: string;
      images?: Array<{ data: string; mimeType: string }>;
      settings: Settings;
    };

    if (!ticker && (!images || images.length === 0)) {
      return jsonResponse({ error: 'Provide ticker or at least one chart image' }, 400);
    }

    let snap: TechnicalSnapshot | null = null;
    let stageHint = 'N/A';
    if (ticker) {
      try {
        snap = await getTechnicalSnapshot(ticker.toUpperCase().trim(), settings.smaPeriod ?? 30);
        const cls = classifyStage(snap);
        stageHint = `${cls.stage} (${cls.confidence}) — ${cls.reasoning}`;
      } catch (e) {
        // Ticker not on Finnhub — fall through to chart-only analysis
        console.error('Finnhub snapshot failed, falling back:', (e as Error).message);
      }
    }

    const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [];
    if (images && images.length > 0) {
      for (const img of images) {
        parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
      }
    }
    parts.push({
      text: ticker
        ? `Analyze ${ticker.toUpperCase()} using the real-time anchor provided. Return the JSON only.`
        : 'Analyze the attached charts using Weinstein\'s method. Return the JSON only.',
    });

    const raw = await generate({
      systemInstruction: buildSystemInstruction(settings.language, snap, stageHint),
      contents: [{ role: 'user', parts }],
      temperature: 0.1,
      jsonMode: true,
    });

    const result = extractJson<AnalysisResult>(raw);

    // Enforce the real-time anchor — overwrite whatever Gemini wrote
    if (snap) {
      result.currentPrice = `${snap.currency === 'USD' ? '$' : snap.currency + ' '}${snap.currentPrice.toFixed(2)}`;
      result.priceTimestamp = new Date(snap.priceTimestamp).toLocaleString(
        settings.language === 'es' ? 'es-ES' : 'en-US',
        { dateStyle: 'short', timeStyle: 'medium' }
      );
      result.tickerSymbol = snap.symbol;
      if (!result.companyName) result.companyName = snap.name;
      result.technicalSnapshot = snap;
    }

    return jsonResponse(result);
  } catch (err) {
    console.error('analyze-market error:', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
