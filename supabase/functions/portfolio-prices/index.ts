// POST /functions/v1/portfolio-prices
// Body: { tickers: string[] }
// Returns current price, name and currency for each ticker.
// Lightweight — uses Yahoo Finance chart endpoint (no full technical analysis).

import { handleCors, jsonResponse } from '../_shared/cors.ts';

interface PriceResult {
  price: number | null;
  name: string;
  currency: string;
  error?: string;
}

async function fetchCurrentPrice(ticker: string): Promise<PriceResult> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error('No data');

    const meta = result.meta ?? {};
    const price: number =
      meta.regularMarketPrice ??
      meta.previousClose ??
      result.indicators?.quote?.[0]?.close?.slice(-1)?.[0] ??
      null;

    return {
      price: typeof price === 'number' ? price : null,
      name: meta.longName ?? meta.shortName ?? ticker,
      currency: meta.currency ?? 'USD',
    };
  } catch (e) {
    return { price: null, name: ticker, currency: '', error: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { tickers } = await req.json() as { tickers: string[] };
    if (!Array.isArray(tickers) || tickers.length === 0) {
      return jsonResponse({ error: 'tickers array required' }, 400);
    }

    // Max 30 tickers per call, fetch in parallel
    const slice = tickers.slice(0, 30);
    const entries = await Promise.all(
      slice.map(async (t) => [t, await fetchCurrentPrice(t)] as [string, PriceResult])
    );

    return jsonResponse(Object.fromEntries(entries));
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
