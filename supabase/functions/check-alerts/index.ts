// POST /functions/v1/check-alerts
// Invoked by pg_cron every 5 minutes. Evaluates all active alerts using
// real Finnhub data (not LLM), updates rows, and inserts alert_events
// so the frontend's Realtime subscription pushes notifications.
//
// Auth: requires header x-cron-secret matching CRON_SECRET env var.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getTechnicalSnapshot } from '../_shared/finnhub.ts';
import { evaluateAlert } from '../_shared/weinstein.ts';

interface AlertRow {
  id: string;
  user_id: string;
  ticker: string;
  condition: string;
  status: string;
  reference_level: number | null;
}

function isMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false; // Sun / Sat
  const minutes = et.getHours() * 60 + et.getMinutes();
  return minutes >= 9 * 60 + 30 && minutes <= 16 * 60;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const marketOpen = isMarketOpen();
  if (!marketOpen && !Deno.env.get('CHECK_ALERTS_ALWAYS')) {
    return jsonResponse({ skipped: true, reason: 'market closed' });
  }

  const { data: alerts, error } = await supabase
    .from('alerts')
    .select('id, user_id, ticker, condition, status, reference_level')
    .eq('status', 'active');

  if (error) return jsonResponse({ error: error.message }, 500);
  if (!alerts || alerts.length === 0) return jsonResponse({ checked: 0 });

  // Group alerts by ticker to minimize Finnhub calls
  const byTicker = new Map<string, AlertRow[]>();
  for (const a of alerts as AlertRow[]) {
    const list = byTicker.get(a.ticker) ?? [];
    list.push(a);
    byTicker.set(a.ticker, list);
  }

  let triggeredCount = 0;
  const now = new Date().toISOString();

  for (const [ticker, group] of byTicker) {
    let snap;
    try {
      snap = await getTechnicalSnapshot(ticker);
    } catch (e) {
      console.error(`Snapshot failed for ${ticker}:`, (e as Error).message);
      continue;
    }

    for (const alert of group) {
      const evalResult = evaluateAlert(
        alert.condition,
        snap,
        alert.reference_level,
        2.0,
        'es'
      );

      if (evalResult.triggered) {
        triggeredCount++;
        await supabase.from('alerts').update({
          status: 'triggered',
          triggered_at: now,
          last_checked_at: now,
          trigger_message: evalResult.message,
        }).eq('id', alert.id);

        await supabase.from('alert_events').insert({
          alert_id: alert.id,
          user_id: alert.user_id,
          ticker: alert.ticker,
          condition: alert.condition,
          price_at_trigger: snap.currentPrice,
          message: evalResult.message,
        });
      } else {
        await supabase.from('alerts').update({ last_checked_at: now }).eq('id', alert.id);
      }
    }
  }

  return jsonResponse({
    checked: alerts.length,
    triggered: triggeredCount,
    tickers: byTicker.size,
  });
});
