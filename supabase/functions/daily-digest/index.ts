// POST /functions/v1/daily-digest
// Invoked by pg_cron every morning at 07:00 UTC (09:00 Madrid).
// Scans SP100 + DAX40 + IBEX35 for Stage 2 stocks and sends a
// Telegram message + email digest to every user who has notifications enabled.
//
// Auth: x-cron-secret header (same as check-alerts).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getTechnicalSnapshot } from '../_shared/marketData.ts';
import { classifyStage } from '../_shared/weinstein.ts';
import { sendTelegramMessage } from '../_shared/telegram.ts';
import { sendAlertEmail } from '../_shared/email.ts';

// ─── Indices to scan every morning ────────────────────────────────────────────
const SCAN_INDICES: Record<string, string[]> = {
  'S&P 100': [
    'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','JPM','LLY',
    'V','UNH','XOM','MA','JNJ','PG','COST','HD','ABBV','BAC','KO','WMT',
    'MRK','NFLX','CVX','CRM','AMD','ORCL','LIN','ACN','MCD','CSCO','PEP',
    'ABT','TXN','ADBE','AMGN','GE','CAT','NOW','INTU','QCOM','GS','RTX',
    'HON','BKNG','MS','DE','ISRG','PFE',
  ],
  'DAX 40': [
    'ADS.DE','AIR.DE','ALV.DE','BAS.DE','BAYN.DE','BMW.DE','BNR.DE',
    'CON.DE','DB1.DE','DBK.DE','DHL.DE','DTE.DE','EOAN.DE','FRE.DE',
    'HEI.DE','HEN3.DE','IFX.DE','LIN.DE','MBG.DE','MRK.DE','MTX.DE',
    'MUV2.DE','P911.DE','PUM.DE','QIA.DE','RHM.DE','RWE.DE','SAP.DE',
    'SHL.DE','SIE.DE','SRT3.DE','VNA.DE','VOW3.DE','WCH.DE','ZAL.DE',
    'ENR.DE','HNR1.DE','1COV.DE','SY1.DE','AFX.DE',
  ],
  'IBEX 35': [
    'ACS.MC','ACX.MC','AENA.MC','AMS.MC','ANA.MC','BBVA.MC','BKT.MC',
    'CABK.MC','COL.MC','ENG.MC','ELE.MC','FER.MC','GRF.MC','IAG.MC',
    'IBE.MC','IDR.MC','ITX.MC','LOG.MC','MAP.MC','MEL.MC','MRL.MC',
    'NTGY.MC','PHM.MC','RED.MC','REP.MC','ROVI.MC','SAB.MC','SAN.MC',
    'SCYR.MC','SLR.MC','TEF.MC','UNI.MC','VIS.MC','AMP.MC','CLNX.MC',
  ],
};

const MAX_CONCURRENT = 8;

async function pooledMap<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) { const i = idx++; results[i] = await fn(items[i]); }
  }
  await Promise.all(Array.from({ length: MAX_CONCURRENT }, worker));
  return results;
}

function relativeTime(ticker: string, stage: string, name: string, price: number, currency: string, rs: number | null): string {
  const rsStr = rs != null ? ` · RS ${rs.toFixed(1)}` : '';
  return `• <b>${ticker}</b> (${name !== ticker ? name : ticker}) — ${price.toFixed(2)} ${currency}${rsStr}`;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // Auth: cron secret only
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase    = createClient(supabaseUrl, serviceKey);
  const botToken    = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
  const appUrl      = Deno.env.get('APP_URL') ?? 'https://weinstein-analyst.vercel.app';

  // ── Scan all tickers ──────────────────────────────────────────────────────
  const allTickers = [...new Set(Object.values(SCAN_INDICES).flat())];

  const snapshots = await pooledMap(allTickers, async (ticker) => {
    try {
      const snap = await getTechnicalSnapshot(ticker);
      const cls  = classifyStage(snap);
      return { ticker, snap, cls };
    } catch {
      return null;
    }
  });

  // Stage 2 with medium/high confidence, price ≥ 2
  const stage2 = snapshots
    .filter(s => s && s.cls.stage === 'STAGE_2' && s.cls.confidence !== 'low' && s.snap.currentPrice >= 2)
    .sort((a, b) => (b!.snap.mansfieldRS ?? 0) - (a!.snap.mansfieldRS ?? 0)) as NonNullable<typeof snapshots[0]>[];

  if (stage2.length === 0) {
    return jsonResponse({ sent: 0, stage2Found: 0 });
  }

  // ── Build message ─────────────────────────────────────────────────────────
  const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const topN  = stage2.slice(0, 12);

  // Group by index for display
  const byIndex: Record<string, typeof topN> = {};
  for (const item of topN) {
    for (const [idxName, tickers] of Object.entries(SCAN_INDICES)) {
      if (tickers.includes(item.ticker)) {
        byIndex[idxName] = [...(byIndex[idxName] ?? []), item];
        break;
      }
    }
  }

  let tgMsg = `📊 <b>Resumen diario Weinstein</b> — ${today}\n\n`;
  tgMsg += `🟢 <b>${stage2.length} valores en Stage 2</b> encontrados en S&P 100, DAX 40 e IBEX 35\n\n`;

  for (const [idxName, items] of Object.entries(byIndex)) {
    if (items.length === 0) continue;
    tgMsg += `<b>${idxName}</b>\n`;
    for (const { ticker, snap, cls } of items) {
      tgMsg += relativeTime(ticker, cls.stage, snap.name, snap.currentPrice, snap.currency, snap.mansfieldRS) + '\n';
    }
    tgMsg += '\n';
  }

  tgMsg += `<a href="${appUrl}">Ver análisis completo →</a>`;

  // ── Fetch all users with notifications enabled ────────────────────────────
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, telegram_chat_id');

  if (!profiles || profiles.length === 0) {
    return jsonResponse({ sent: 0, stage2Found: stage2.length });
  }

  let sentCount = 0;

  for (const profile of profiles as Array<{ id: string; email: string; telegram_chat_id: number | null }>) {
    // Telegram
    if (botToken && profile.telegram_chat_id) {
      await sendTelegramMessage(profile.telegram_chat_id, tgMsg, botToken)
        .then(ok => { if (ok) sentCount++; })
        .catch(err => console.error(`[digest] Telegram failed for ${profile.id}:`, err));
    }

    // Email digest (only to users with Telegram connected — they've opted in)
    if (profile.telegram_chat_id && profile.email) {
      const topList = topN.slice(0, 8)
        .map(({ ticker, snap, cls }) => {
          const rsStr = snap.mansfieldRS != null ? ` · RS ${snap.mansfieldRS.toFixed(1)}` : '';
          const conf  = cls.confidence === 'high' ? '🔴' : '🟡';
          return `${conf} <strong>${ticker}</strong> — ${snap.currentPrice.toFixed(2)} ${snap.currency}${rsStr}`;
        })
        .join('<br>');

      sendAlertEmail({
        to: profile.email,
        ticker: 'Resumen diario',
        condition: 'daily_digest',
        message: `${stage2.length} valores en Stage 2 hoy.<br><br>${topList}`,
        price: 0,
        currency: '',
        appUrl,
      }).catch(err => console.error(`[digest] Email failed:`, err));
    }
  }

  return jsonResponse({
    date: today,
    stage2Found: stage2.length,
    sent: sentCount,
    tickers: topN.map(s => s.ticker),
  });
});
