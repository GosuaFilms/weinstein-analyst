// POST /functions/v1/chat
// Body: { history: Array<{role, parts}>, userMessage: string, context?: AnalysisResult, language: 'es'|'en' }

import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { generate, MODEL_CHAT, type AnthropicMessage } from '../_shared/anthropic.ts';
import { getTechnicalSnapshot } from '../_shared/marketData.ts';
import { classifyStage } from '../_shared/weinstein.ts';

// El frontend envía historial en formato Gemini (role:'model', parts:[{text}])
// Lo convertimos al formato Anthropic (role:'assistant', content: string)
interface GeminiMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

function toAnthropicHistory(history: GeminiMessage[], userMessage: string): AnthropicMessage[] {
  const messages: AnthropicMessage[] = history.map((msg) => ({
    role: msg.role === 'model' ? 'assistant' : 'user',
    content: msg.parts.map((p) => p.text).join(''),
  }));
  messages.push({ role: 'user', content: userMessage });
  return messages;
}

// ─── Asset detection ───────────────────────────────────────────────────────
// Tries to extract a ticker or company name from the user message.
// Returns null if the message looks like a conceptual question (no asset implied).

const QUESTION_STARTERS = new Set([
  'qué', 'que', 'cómo', 'como', 'cuál', 'cual', 'cuándo', 'cuando',
  'por', 'dónde', 'donde', 'quién', 'quien', 'explica', 'explain',
  'what', 'how', 'when', 'where', 'why', 'who', 'is', 'are', 'can',
  'does', 'define', 'cuéntame', 'describe',
]);

// Pure noise: articles, prepositions, common abbreviations that look like tickers
const SKIP_TOKENS = new Set([
  'MM', 'RS', 'SMA', 'EMA', 'ATH', 'ETF', 'IPO', 'FAQ',
  'EU', 'US', 'UK', 'SA', 'SL', 'PLC', 'AG', 'NV',
  'A', 'I', 'ME', 'EL', 'LA', 'LO', 'EN', 'DE', 'SI',
  'NO', 'ES', 'SE', 'UN', 'UNA', 'AND', 'THE', 'FOR',
  'CON', 'DEL', 'LOS', 'LAS', 'AL', 'MAS', 'MUY',
]);

// Spanish/English articles and prepositions to strip before the company name
const STRIP_PREFIX = /^(?:el|la|los|las|un|una|the|a|an)\s+/i;

function extractAssetQuery(message: string): string | null {
  const trimmed = message.trim();

  // 1. Bare ticker or pair (case-insensitive): aapl  AMP.MC  btc/usd  EUR/USD
  if (/^[A-Za-z]{1,5}(?:\.[A-Za-z]{1,3})?(?:\/[A-Za-z]{2,4})?$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  // 2. Action phrase → extract the asset name that follows
  //    "analiza Amper", "cómo está tesla", "etapa de Santander", "mira NVDA", etc.
  const actionMatch = trimmed.match(
    /(?:analiza(?:r)?|mira(?:r)?|busca(?:r)?|dame|hazme|háblame de|cuéntame de|qué tal(?: está)?|cómo (?:está|va)|etapa de|info(?:rmación)? de|datos de|análisis de)\s+(.+?)(?:\s*[?!,.]|$)/i
  );
  if (actionMatch) {
    const candidate = actionMatch[1].trim().replace(STRIP_PREFIX, '').slice(0, 50);
    if (candidate) return candidate;
  }

  // 3. Short message (1-4 words) that isn't a conceptual question
  const words = trimmed.split(/\s+/);
  const firstWord = words[0]?.toLowerCase() ?? '';
  if (
    words.length <= 4 &&
    !QUESTION_STARTERS.has(firstWord) &&
    !trimmed.endsWith('?') &&
    !/\d/.test(trimmed)   // avoid pure numbers
  ) {
    // Strip leading article ("la Telefónica" → "Telefónica")
    return trimmed.replace(STRIP_PREFIX, '').trim() || trimmed;
  }

  // 4. Explicit ticker embedded in longer message (ALL-CAPS 2-5 letters + optional .XX)
  const tickerMatch = trimmed.match(/\b([A-Z]{2,5}(?:\.[A-Z]{1,3})?(?:\/[A-Z]{2,4})?)\b/);
  if (tickerMatch && !SKIP_TOKENS.has(tickerMatch[1])) {
    return tickerMatch[1];
  }

  return null;
}

// ─── Live market data fetch ────────────────────────────────────────────────

async function tryFetchMarketData(userMessage: string, language: 'es' | 'en'): Promise<string | null> {
  const query = extractAssetQuery(userMessage);
  if (!query) return null;

  try {
    const snap = await getTechnicalSnapshot(query, 30);
    if (!snap?.currentPrice || isNaN(snap.currentPrice)) return null;

    const cls = classifyStage(snap);
    const lang = language === 'es';
    const currency = snap.currency === 'USD' ? '$' : snap.currency + ' ';
    const price = `${currency}${snap.currentPrice.toFixed(2)}`;
    const ts = new Date(snap.priceTimestamp).toLocaleString(
      lang ? 'es-ES' : 'en-US',
      { dateStyle: 'short', timeStyle: 'medium' }
    );

    return `📊 DATOS EN TIEMPO REAL — ${snap.name} (${snap.symbol})
• Precio: ${price}  |  Fecha: ${ts}
• Etapa Weinstein (reglas): ${cls.stage} (${cls.confidence}) — ${cls.reasoning}
• SMA30 semanal: ${snap.sma30Weekly?.toFixed(2) ?? 'N/A'}  |  Pendiente: ${snap.sma30Slope?.toFixed(2) ?? 'N/A'}% → ${snap.sma30Trend ?? 'N/A'}
• Distancia MM30: ${snap.distanceFromSMA30Pct?.toFixed(2) ?? 'N/A'}%${snap.extendedStage2 ? '  ⚠ EXTENDIDA >15%' : ''}
• Mansfield RS vs ${snap.benchmarkName ?? 'benchmark'}: ${snap.mansfieldRS?.toFixed(2) ?? 'N/A'}  |  MA13: ${snap.mansfieldRSMA13?.toFixed(2) ?? 'N/A'}  |  Tendencia: ${snap.mansfieldRSTrend ?? 'N/A'}
• Filtro mercado: ${snap.benchmarkName} en ${snap.benchmarkStage ?? 'N/A'} — ${snap.benchmarkStageReason ?? 'N/A'}
• Stop Weinstein: ${snap.suggestedStopLoss?.toFixed(2) ?? 'N/A'} ${snap.currency}  (${snap.stopLossBasis ?? 'N/A'}, riesgo ${snap.stopLossRiskPct?.toFixed(2) ?? 'N/A'}%)
• Volumen ratio: ${snap.volumeRatio?.toFixed(2) ?? 'N/A'}x vs MM30
• Máx/Mín 52 semanas: ${snap.weekly52High?.toFixed(2) ?? 'N/A'} / ${snap.weekly52Low?.toFixed(2) ?? 'N/A'}`;
  } catch {
    // Symbol not found or data unavailable — proceed without live data
    return null;
  }
}

// ─── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { history, userMessage, context, language } = await req.json() as {
      history: GeminiMessage[];
      userMessage: string;
      context?: Record<string, unknown>;
      language: 'es' | 'en';
    };

    const langName = language === 'es' ? 'Spanish' : 'English';

    // Fetch live market data in parallel with building the history
    const liveData = await tryFetchMarketData(userMessage, language);

    let system = `You are Alpha Stage's AI assistant, expert in Stan Weinstein's Stage Analysis. Respond in ${langName}. Be concise and precise.`;

    if (liveData) {
      system += `\n\n${liveData}\n\nYou have REAL-TIME data above — do NOT say you lack information. Apply Weinstein's full framework: stage verdict, MM30 slope, Mansfield RS vs benchmark, volume confirmation, stop-loss, and market filter (if benchmark is in Stage 3/4, avoid longs). If Stage 2 is extended >15% above MM30, warn about partial exit.`;
    }

    if (context) {
      system += `\n\nCurrent analysis context:\n${JSON.stringify(context).slice(0, 2000)}`;
    }

    const raw = await generate({
      system,
      messages: toAnthropicHistory(history, userMessage),
      model: MODEL_CHAT,
      maxTokens: 1024,
    });

    return jsonResponse({ text: raw });
  } catch (err) {
    console.error('chat error:', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
