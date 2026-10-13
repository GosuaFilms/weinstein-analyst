// POST /functions/v1/portfolio-prices
// Body: { tickers: string[] }
// Returns current price, name and currency for each ticker via Twelve Data.

import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireUser } from '../_shared/auth.ts';
import { getLivePrice } from '../_shared/marketData.ts';

interface PriceResult {
  price: number | null;
  name: string;
  currency: string;
  error?: string;
}

const MAX_TICKERS = 50;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const authed = await requireUser(req);
  if (authed instanceof Response) return authed;

  try {
    const { tickers } = await req.json() as { tickers: string[] };
    if (!Array.isArray(tickers) || tickers.length === 0) {
      return jsonResponse({ error: 'tickers array required' }, 400);
    }

    const unique = [...new Set(tickers.map((t) => String(t).trim().toUpperCase()))].slice(0, MAX_TICKERS);
    const result: Record<string, PriceResult> = {};
    let next = 0;
    await Promise.all(Array.from({ length: 8 }, async () => {
      while (next < unique.length) {
        const ticker = unique[next++];
        try {
          result[ticker] = await getLivePrice(ticker);
        } catch (e) {
          result[ticker] = { price: null, name: ticker, currency: '', error: (e as Error).message };
        }
      }
    }));
    return jsonResponse(result);
  } catch (err) {
    console.error('[portfolio-prices]', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
