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
REAL-TIME TECHNICAL ANCHOR (source: TwelveData + Yahoo Finance — DO NOT invent prices):
- Symbol: ${snap.symbol} (${snap.name})
- Current price: ${snap.currentPrice} ${snap.currency}
- Price timestamp: ${snap.priceTimestamp}
- Change: ${snap.change} (${snap.changePercent}%)
- Day range: ${snap.dayLow} — ${snap.dayHigh}
- Previous close: ${snap.previousClose}
- SMA30 (weekly): ${snap.sma30Weekly ?? 'N/A'}
- MM30 slope (last 5w): ${snap.sma30Slope?.toFixed(2) ?? 'N/A'}% → trend = ${snap.sma30Trend ?? 'N/A'} (Weinstein: Stage 2 requires RISING)
- Distance from SMA30: ${snap.distanceFromSMA30Pct?.toFixed(2) ?? 'N/A'}%${snap.extendedStage2 ? ' ⚠ EXTENDED (>15% above MM30 — late Stage 2, consider partial exit)' : ''}
- Weekly volume ratio vs 30-week avg: ${snap.volumeRatio?.toFixed(2) ?? 'N/A'}x (Weinstein breakout filter: ≥2×)
- 52-week high / low: ${snap.weekly52High ?? 'N/A'} / ${snap.weekly52Low ?? 'N/A'}
- Mansfield Relative Strength vs ${snap.benchmarkName ?? 'benchmark'} (${snap.benchmarkSymbol ?? 'N/A'}): ${snap.mansfieldRS?.toFixed(2) ?? 'N/A'} (prev: ${snap.mansfieldRSPrev?.toFixed(2) ?? 'N/A'}, 13w MA: ${snap.mansfieldRSMA13?.toFixed(2) ?? 'N/A'}) → trend = ${snap.mansfieldRSTrend ?? 'N/A'}
  Weinstein rule: Stage 2 requires RS > 0 AND rising; Stage 4 usually RS < 0 AND falling.
- Market filter (${snap.benchmarkName ?? 'benchmark'} own stage): ${snap.benchmarkStage ?? 'N/A'} — ${snap.benchmarkStageReason ?? 'N/A'}
  Weinstein rule: do NOT open longs if the market/benchmark is itself in Stage 3 or 4.
- Suggested Weinstein stop-loss: ${snap.suggestedStopLoss?.toFixed(2) ?? 'N/A'} ${snap.currency} (basis: ${snap.stopLossBasis ?? 'N/A'}, risk ${snap.stopLossRiskPct?.toFixed(2) ?? 'N/A'}%)
- Recent swing-low (last 10w): ${snap.recentSwingLow?.toFixed(2) ?? 'N/A'}
- Rule-based stage verdict: ${stageHint}

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
  "sma30Analysis": "Relación precio/MM30 semanal Y pendiente (ascendente/plana/descendente) — cita el valor numérico del anchor. Weinstein: Etapa 2 exige precio > MM30 Y MM30 ascendente.",
  "relativeStrength": "Fuerza Relativa Mansfield — cita el valor numérico, el benchmark y su MA13. Indica si está positiva/negativa y subiendo/bajando. Weinstein: Etapa 2 requiere RS > 0 Y subiendo; Etapa 4 típicamente RS < 0 Y bajando.",
  "volumeAnalysis": "Perfil de volumen usando el ratio del anchor. Weinstein: ruptura válida de Etapa 1→2 requiere volumen ≥2× la media de 30 semanas.",
  "support": "Soporte numérico (sin texto) — usa el swing-low reciente del anchor si aplica",
  "resistance": "Resistencia numérica (sin texto) — nivel horizontal más relevante en el rango previo",
  "entryPrice": "Nivel de disparo (breakout de resistencia o pullback a la resistencia rota)",
  "stopLoss": "Usa el suggestedStopLoss del anchor tal cual (basado en swing-low o MM30 según Weinstein)",
  "verdict": "Frase corta de acción",
  "verdictType": "BUY | SELL | WAIT | CLOSE",
  "suggestedStrategy": "Plan concreto (2-4 frases) que incluya: (a) veredicto de Etapa 1/2/3/4 explícito, (b) filtro de mercado (si el benchmark NO está en Etapa 2, evitar largos), (c) acción recomendada con entrada/stop/objetivo, (d) advertencia si Etapa 2 está extendida (>15% sobre MM30)."
}
Reglas estrictas (método Stan Weinstein):
- NUNCA inventes precios: usa siempre el anchor.
- NUNCA promedies precios ni uses "previous close" como actual.
- Si el benchmark está en Etapa 3 o 4, el veredicto por defecto es WAIT o SELL (Weinstein: no comprar contra un mercado bajista).
- Si el precio está extendido >15% sobre MM30, menciona salida parcial.
- Support/resistance sólo numérico, sin texto extra.`;
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
        // Ticker not available on TwelveData or Yahoo — fall through to chart-only analysis
        console.error('Market data snapshot failed, falling back:', (e as Error).message);
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
