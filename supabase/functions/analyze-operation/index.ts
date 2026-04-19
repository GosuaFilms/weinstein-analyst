// POST /functions/v1/analyze-operation
// Body: { ticker, purchaseDate, purchasePrice, shares, settings }

import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getTechnicalSnapshot } from '../_shared/marketData.ts';
import { classifyStage } from '../_shared/weinstein.ts';
import { generate, extractJson } from '../_shared/gemini.ts';

interface Settings {
  smaPeriod: number;
  volumeMultiplier: number;
  language: 'es' | 'en';
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json();
    const { ticker, purchaseDate, purchasePrice, shares, settings } = body as {
      ticker: string;
      purchaseDate: string;
      purchasePrice: string;
      shares: string;
      settings: Settings;
    };

    if (!ticker) return jsonResponse({ error: 'ticker is required' }, 400);

    const snap = await getTechnicalSnapshot(ticker.toUpperCase().trim(), settings.smaPeriod ?? 30);
    const cls = classifyStage(snap);

    const pp = parseFloat(purchasePrice);
    const sh = parseFloat(shares);
    const profitAmount = (snap.currentPrice - pp) * sh;
    const profitPct = ((snap.currentPrice - pp) / pp) * 100;

    const langName = settings.language === 'es' ? 'Spanish' : 'English';
    const systemInstruction = `You are a professional analyst using Stan Weinstein's Stage Analysis.

DETERMINISTIC FACTS (use exactly, do not recompute):
- Asset: ${snap.symbol} (${snap.name})
- Current price: ${snap.currentPrice} ${snap.currency} @ ${snap.priceTimestamp}
- Purchase: ${sh} shares @ ${pp} on ${purchaseDate}
- P/L amount: ${profitAmount.toFixed(2)} ${snap.currency}
- P/L percent: ${profitPct.toFixed(2)}%
- Current stage (rule-based): ${cls.stage} (${cls.confidence}) — ${cls.reasoning}
- SMA30 weekly: ${snap.sma30Weekly?.toFixed(2) ?? 'N/A'}

Return STRICT JSON in ${langName}:
{
  "companyName": "...",
  "tickerSymbol": "${snap.symbol}",
  "currentPrice": "Price w/ symbol",
  "priceTimestamp": "Human timestamp",
  "purchasePrice": "${pp}",
  "purchaseDate": "${purchaseDate}",
  "shares": ${sh},
  "profitPercentage": "${profitPct.toFixed(2)}%",
  "profitAmount": "${profitAmount.toFixed(2)} ${snap.currency}",
  "stage": "Detailed stage label",
  "technicalAnalysis": "Brief technical read vs purchase date",
  "verdict": "Short action phrase",
  "verdictType": "BUY|SELL|WAIT|CLOSE",
  "suggestedStrategy": "Concrete next-step plan for THIS operation"
}`;

    const raw = await generate({
      systemInstruction,
      contents: [{ role: 'user', parts: [{ text: 'Return only the JSON.' }] }],
      temperature: 0.1,
      jsonMode: true,
    });

    const result = extractJson<Record<string, unknown>>(raw);
    // Enforce authoritative numbers
    result.currentPrice = `${snap.currency === 'USD' ? '$' : snap.currency + ' '}${snap.currentPrice.toFixed(2)}`;
    result.priceTimestamp = new Date(snap.priceTimestamp).toLocaleString(
      settings.language === 'es' ? 'es-ES' : 'en-US',
      { dateStyle: 'short', timeStyle: 'medium' }
    );
    result.profitAmount = `${profitAmount >= 0 ? '+' : ''}${profitAmount.toFixed(2)} ${snap.currency}`;
    result.profitPercentage = `${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(2)}%`;
    result.tickerSymbol = snap.symbol;
    result.shares = sh;

    return jsonResponse(result);
  } catch (err) {
    console.error('analyze-operation error:', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
