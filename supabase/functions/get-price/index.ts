// GET /functions/v1/get-price?ticker=AAPL
// Returns real-time price from TwelveData.
// Auth: Bearer token required.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const TD_BASE = 'https://api.twelvedata.com';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // Auth
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return jsonResponse({ error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const tdKey       = Deno.env.get('TWELVEDATA_API_KEY');

  const token = authHeader.slice(7);
  const admin = createClient(supabaseUrl, serviceKey);
  const { error: authError } = await admin.auth.getUser(token);
  if (authError) return jsonResponse({ error: 'unauthorized' }, 401);

  if (!tdKey) return jsonResponse({ error: 'TWELVEDATA_API_KEY not configured' }, 503);

  // Parse ticker from URL or body
  const url    = new URL(req.url);
  let ticker   = url.searchParams.get('ticker') ?? '';
  if (!ticker && req.method === 'POST') {
    const body = await req.json().catch(() => ({})) as { ticker?: string };
    ticker = body.ticker ?? '';
  }
  if (!ticker.trim()) return jsonResponse({ error: 'ticker required' }, 400);

  const sym = ticker.trim().toUpperCase();

  try {
    // Fetch real-time price + quote in parallel
    const [priceRes, quoteRes] = await Promise.all([
      fetch(`${TD_BASE}/price?symbol=${encodeURIComponent(sym)}&apikey=${tdKey}`),
      fetch(`${TD_BASE}/quote?symbol=${encodeURIComponent(sym)}&apikey=${tdKey}`),
    ]);
    const [priceData, quoteData] = await Promise.all([priceRes.json(), quoteRes.json()]);

    if (quoteData.status === 'error') {
      return jsonResponse({ error: `Ticker not found: ${sym}` }, 404);
    }

    const livePrice  = priceData?.price  ? parseFloat(priceData.price)            : null;
    const closePrice = quoteData?.close  ? parseFloat(quoteData.close)            : null;
    const price      = livePrice ?? closePrice;
    const change     = quoteData?.percent_change ? parseFloat(quoteData.percent_change) : null;
    const currency   = quoteData?.currency ?? 'USD';
    const name       = quoteData?.name ?? sym;
    const exchange   = quoteData?.exchange ?? '';
    const isRealtime = livePrice != null;
    const fetchedAt  = new Date().toISOString();

    return jsonResponse({ ticker: sym, name, price, change, currency, exchange, isRealtime, fetchedAt });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
