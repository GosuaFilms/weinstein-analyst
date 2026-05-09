// POST /functions/v1/check-alerts
// Invoked by pg_cron every 5 minutes. Evaluates all active alerts using
// real market data (TwelveData + Yahoo, not LLM), updates rows, inserts
// alert_events (triggers Realtime push to browser) and sends email via Resend.
//
// Auth: requires header x-cron-secret matching CRON_SECRET env var.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getTechnicalSnapshot } from '../_shared/marketData.ts';
import { evaluateAlert } from '../_shared/weinstein.ts';
import { sendAlertEmail } from '../_shared/email.ts';
import { sendWebPush, type PushSub } from '../_shared/webpush.ts';
import { sendTelegramMessage } from '../_shared/telegram.ts';

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
  if (day === 0 || day === 6) return false;
  const minutes = et.getHours() * 60 + et.getMinutes();
  return minutes >= 9 * 60 + 30 && minutes <= 16 * 60;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // Accept either the cron secret (pg_cron) or a valid user JWT (manual trigger from UI)
  const cronSecret = Deno.env.get('CRON_SECRET');
  const providedCronSecret = req.headers.get('x-cron-secret');
  const authHeader = req.headers.get('Authorization');

  // Distinguish cron vs manual UI trigger — manual triggers bypass market hours
  let isManualTrigger = false;

  if (cronSecret && providedCronSecret !== cronSecret) {
    // Not a valid cron call — check if it's an authenticated user
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const token = authHeader.slice(7);
    const { error: authError } = await createClient(supabaseUrl, anonKey)
      .auth.getUser(token);
    if (authError) return jsonResponse({ error: 'unauthorized' }, 401);
    isManualTrigger = true; // valid user JWT → manual trigger from UI
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Skip market-hours check for manual UI triggers — the user explicitly asked
  const marketOpen = isMarketOpen();
  if (!marketOpen && !isManualTrigger && !Deno.env.get('CHECK_ALERTS_ALWAYS')) {
    return jsonResponse({ skipped: true, reason: 'market closed' });
  }

  const { data: alerts, error } = await supabase
    .from('alerts')
    .select('id, user_id, ticker, condition, status, reference_level')
    .eq('status', 'active');

  if (error) return jsonResponse({ error: error.message }, 500);
  if (!alerts || alerts.length === 0) return jsonResponse({ checked: 0 });

  // Pre-fetch user emails + push subscriptions in one pass
  const userIds = [...new Set((alerts as AlertRow[]).map(a => a.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, telegram_chat_id')
    .in('id', userIds);
  const emailByUser = new Map<string, string>(
    (profiles ?? []).map((p: { id: string; email: string }) => [p.id, p.email])
  );
  const telegramByUser = new Map<string, number>(
    (profiles ?? [])
      .filter((p: { telegram_chat_id: number | null }) => p.telegram_chat_id)
      .map((p: { id: string; telegram_chat_id: number }) => [p.id, p.telegram_chat_id])
  );

  const { data: pushSubs } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', userIds);
  // Map: user_id → PushSub[]
  const subsByUser = new Map<string, PushSub[]>();
  for (const s of pushSubs ?? []) {
    const list = subsByUser.get(s.user_id) ?? [];
    list.push({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth });
    subsByUser.set(s.user_id, list);
  }

  const vapidPublicKey  = Deno.env.get('VAPID_PUBLIC_KEY')  ?? '';
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  const vapidSubject    = Deno.env.get('VAPID_SUBJECT')     ?? 'mailto:info@example.com';
  const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';

  // Group alerts by ticker to minimise market-data API calls
  const byTicker = new Map<string, AlertRow[]>();
  for (const a of alerts as AlertRow[]) {
    const list = byTicker.get(a.ticker) ?? [];
    list.push(a);
    byTicker.set(a.ticker, list);
  }

  const appUrl = Deno.env.get('APP_URL') ?? 'https://www.alphastage.finance';
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

        // 1. Update alert row
        await supabase.from('alerts').update({
          status: 'triggered',
          triggered_at: now,
          last_checked_at: now,
          trigger_message: evalResult.message,
        }).eq('id', alert.id);

        // 2. Insert event (triggers Realtime → browser notification)
        await supabase.from('alert_events').insert({
          alert_id: alert.id,
          user_id: alert.user_id,
          ticker: alert.ticker,
          condition: alert.condition,
          price_at_trigger: snap.currentPrice,
          message: evalResult.message,
        });

        // 3. Send email (fire-and-forget — never blocks the pipeline)
        const userEmail = emailByUser.get(alert.user_id);
        if (userEmail) {
          sendAlertEmail({
            to: userEmail,
            ticker: alert.ticker,
            companyName: snap.name !== alert.ticker ? snap.name : undefined,
            condition: alert.condition,
            message: evalResult.message,
            price: snap.currentPrice,
            currency: snap.currency,
            appUrl,
          }).catch(err => console.error(`Email failed for ${alert.ticker}:`, err));
        }

        // 4. Send Telegram notification (fire-and-forget)
        const telegramChatId = telegramByUser.get(alert.user_id);
        if (telegramBotToken && telegramChatId) {
          const price = snap.currentPrice.toFixed(2);
          const currency = snap.currency ?? '';
          const companyLabel = snap.name && snap.name !== alert.ticker
            ? ` · ${snap.name}` : '';
          const msg =
            `🔔 <b>Alerta: ${alert.ticker}</b>${companyLabel}\n\n` +
            `${evalResult.message}\n\n` +
            `💰 Precio actual: <b>${price} ${currency}</b>\n` +
            `<a href="${appUrl}">Ver en Weinstein Analyst →</a>`;
          sendTelegramMessage(telegramChatId, msg, telegramBotToken)
            .catch(err => console.error(`Telegram failed for ${alert.ticker}:`, err));
        }

        // 5. Send push notifications (fire-and-forget)
        if (vapidPublicKey && vapidPrivateKey) {
          const subs = subsByUser.get(alert.user_id) ?? [];
          for (const sub of subs) {
            sendWebPush(
              sub,
              {
                title: `🔔 Alerta: ${alert.ticker}`,
                body: evalResult.message,
                icon: '/icon-192.png',
                tag: `alert-${alert.id}`,
                url: appUrl,
              },
              vapidPublicKey,
              vapidPrivateKey,
              vapidSubject,
            ).then(r => {
              // 410 Gone = subscription expired; remove it
              if (r.status === 410) {
                supabase.from('push_subscriptions')
                  .delete().eq('endpoint', sub.endpoint)
                  .then(() => {});
              }
            }).catch(err => console.error(`Push failed for ${alert.ticker}:`, err));
          }
        }
      } else {
        await supabase.from('alerts').update({ last_checked_at: now }).eq('id', alert.id);
      }
    }
  }

  return jsonResponse({
    checked: alerts.length,
    triggered: triggeredCount,
    tickers: byTicker.size,
    emailsQueued: triggeredCount,
  });
});
