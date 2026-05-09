// POST /functions/v1/portfolio-prices
// Body: { tickers: string[] }
// Returns current price, name and currency for each ticker via TwelveData.

import { handleCors, jsonResponse } from '../_shared/cors.ts';

interface PriceResult {
  price: number | null;
  name: string;
  currency: string;
  error?: string;
}

const TD_BASE = 'https://api.twelvedata.com';

async function fetchPrices(tickers: string[]): Promise<Record<string, PriceResult>> {
  const apiKey = Deno.env.get('TWELVEDATA_API_KEY');
  if (!apiKey) throw new Error('TWELVEDATA_API_KEY not set');

  // TwelveData accepts comma-separated symbols in a single /quote call
  const symbols = tickers.join(',');
  const url = `${TD_BASE}/quote?symbol=${encodeURIComponent(symbols)}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TwelveData HTTP ${res.status}`);
  const data = await res.json();

  const result: Record<string, PriceResult> = {};

  // If single ticker, TwelveData returns the object directly (not wrapped in ticker key)
  const isMulti = tickers.length > 1;

  for (const ticker of tickers) {
    try {
      const q = isMulti ? data[ticker] : data;
      if (!q || q.status === 'error' || !q.close) {
        result[ticker] = { price: null, name: ticker, currency: '', error: q?.message ?? 'no data' };
        continue;
      }
      result[ticker] = {
        price: parseFloat(q.close),
        name: q.name ?? ticker,
        currency: q.currency ?? 'USD',
      };
    } catch (e) {
      result[ticker] = { price: null, name: ticker, currency: '', error: (e as Error).message };
    }
  }

  return result;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { tickers } = await req.json() as { tickers: string[] };
    if (!Array.isArray(tickers) || tickers.length === 0) {
      return jsonResponse({ error: 'tickers array required' }, 400);
    }

    // TwelveData free plan: max 8 symbols per batch request
    const slice = tickers.slice(0, 8);
    const prices = await fetchPrices(slice);
    return jsonResponse(prices);
  } catch (err) {
    console.error('[portfolio-prices]', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
