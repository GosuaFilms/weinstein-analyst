// POST /functions/v1/get-live-price
// Body: { ticker: string, smaPeriod?: number }
// Returns: TechnicalSnapshot (real-time price + SMA30 weekly + volume)

import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getTechnicalSnapshot } from '../_shared/marketData.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { ticker, smaPeriod } = await req.json();
    if (!ticker || typeof ticker !== 'string') {
      return jsonResponse({ error: 'ticker is required' }, 400);
    }
    const snap = await getTechnicalSnapshot(ticker.toUpperCase().trim(), smaPeriod ?? 30);
    return jsonResponse(snap);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
