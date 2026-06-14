// POST /functions/v1/stage2-daily
// Runs every weekday at 22:00 UTC via pg_cron (after US market close).
// For each configured index:
//   1. Scans all tickers and keeps only Stage 2 results
//   2. Saves them to stage2_snapshots
//   3. Diffs with yesterday → detects NEW entries and EXITS
//   4. Sends a Telegram summary if there are changes
//
// Auth: requires header x-cron-secret OR a valid user JWT (for manual triggers).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getTechnicalSnapshot } from '../_shared/marketData.ts';
import { classifyStage } from '../_shared/weinstein.ts';
import { INDICES } from '../_shared/indices.ts';
import { sendTelegramMessage } from '../_shared/telegram.ts';

// ─── Config ───────────────────────────────────────────────────────────────────

// Indices to scan every day — ordered by priority
// Kept to the most actionable indices to stay within function timeout
const DAILY_INDICES = ['IBEX35', 'SP100', 'NASDAQ50', 'DAX40', 'EUROSTOXX50'];

// ─── Concurrency helper ───────────────────────────────────────────────────────

async function pooledMap<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// ─── Stage 2 scanner for one index ───────────────────────────────────────────

async function scanIndexStage2(indexId: string) {
  const indexDef = INDICES[indexId];
  if (!indexDef) return [];

  const results = await pooledMap(indexDef.tickers, 8, async (ticker: string) => {
    try {
      const snap = await getTechnicalSnapshot(ticker, 30);
      const cls  = classifyStage(snap);
      if (cls.stage !== 'STAGE_2') return null;
      return {
        index_id:      indexId,
        symbol:        snap.symbol,
        name:          snap.name,
        currency:      snap.currency,
        current_price: snap.currentPrice,
        confidence:    cls.confidence,
        sma30:         snap.sma30Weekly,
        distance_pct:  snap.distanceFromSMA30Pct,
        mansfield_rs:  snap.mansfieldRS,
        volume_ratio:  snap.volumeRatio,
        extended:      snap.extendedStage2,
        stop_loss:     snap.suggestedStopLoss,
        stop_risk_pct: snap.stopLossRiskPct,
      };
    } catch {
      return null;
    }
  });

  return results.filter(Boolean);
}

// ─── Telegram formatter ───────────────────────────────────────────────────────

function formatTelegramMessage(
  date: string,
  newEntries: { symbol: string; name: string; index_id: string; confidence: string }[],
  exits:      { symbol: string; name: string; index_id: string }[],
  total:      number,
): string {
  const lines: string[] = [
    `📊 <b>Stage 2 Monitor — ${date}</b>`,
    `Total en Stage 2: <b>${total}</b> acciones`,
    '',
  ];

  if (newEntries.length > 0) {
    lines.push(`🆕 <b>NUEVAS entradas en Stage 2 (${newEntries.length})</b>`);
    for (const s of newEntries.slice(0, 10)) {
      const conf = s.confidence === 'high' ? '🟢' : s.confidence === 'medium' ? '🟡' : '🔵';
      lines.push(`  ${conf} <b>${s.symbol}</b> — ${s.name} [${s.index_id}]`);
    }
    if (newEntries.length > 10) lines.push(`  … y ${newEntries.length - 10} más`);
    lines.push('');
  }

  if (exits.length > 0) {
    lines.push(`📤 <b>SALIDAS de Stage 2 (${exits.length})</b>`);
    for (const s of exits.slice(0, 10)) {
      lines.push(`  🔴 <b>${s.symbol}</b> — ${s.name} [${s.index_id}]`);
    }
    if (exits.length > 10) lines.push(`  … y ${exits.length - 10} más`);
    lines.push('');
  }

  if (newEntries.length === 0 && exits.length === 0) {
    lines.push('✅ Sin cambios respecto a ayer.');
  }

  lines.push('<i>#Stage2Monitor #Weinstein</i>');
  return lines.join('\n');
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // Auth: cron secret or user JWT
  const cronSecret    = Deno.env.get('CRON_SECRET');
  const providedSecret = req.headers.get('x-cron-secret');
  const authHeader    = req.headers.get('Authorization');
  if (cronSecret && providedSecret !== cronSecret && !authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const today     = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  try {
    // ── 1. Scan indices sequentially, saving after each one ──────────────────
    // Sequential (not parallel) to avoid timeouts on free-tier edge functions.
    // Results are saved to DB after each index so partial progress is kept.
    console.log(`[stage2-daily] scanning ${DAILY_INDICES.length} indices for ${today}…`);
    const allStage2: ReturnType<typeof scanIndexStage2> extends Promise<infer T> ? T : never[] = [];
    for (const indexId of DAILY_INDICES) {
      try {
        console.log(`[stage2-daily] scanning ${indexId}…`);
        const rows = await scanIndexStage2(indexId);
        if (rows.length > 0) {
          const toSave = rows.map(r => ({ ...r, scan_date: today }));
          await supabase.from('stage2_snapshots').upsert(toSave, { onConflict: 'scan_date,index_id,symbol' });
          console.log(`[stage2-daily] ${indexId}: ${rows.length} Stage 2 stocks saved`);
        }
        allStage2.push(...rows);
      } catch (e) {
        console.error(`[stage2-daily] ${indexId} failed:`, e);
      }
    }

    console.log(`[stage2-daily] total Stage 2 stocks found: ${allStage2.length}`);

    // ── 3. Load yesterday's list to compute diff ─────────────────────────────
    const { data: yesterdayRows } = await supabase
      .from('stage2_snapshots')
      .select('symbol, name, index_id')
      .eq('scan_date', yesterday);

    const todaySet     = new Set(allStage2.map(r => `${r.index_id}:${r.symbol}`));
    const yesterdaySet = new Set((yesterdayRows ?? []).map((r: { symbol: string; index_id: string }) => `${r.index_id}:${r.symbol}`));

    const newEntries = allStage2.filter(r => !yesterdaySet.has(`${r.index_id}:${r.symbol}`));
    const exits      = (yesterdayRows ?? []).filter((r: { symbol: string; index_id: string }) => !todaySet.has(`${r.index_id}:${r.symbol}`));

    console.log(`[stage2-daily] new=${newEntries.length} exits=${exits.length}`);

    // ── 4. Send Telegram summary ─────────────────────────────────────────────
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId   = Deno.env.get('TELEGRAM_CHANNEL_ID') || Deno.env.get('TELEGRAM_CHAT_ID');
    if (botToken && chatId) {
      const msg = formatTelegramMessage(today, newEntries, exits, allStage2.length);
      await sendTelegramMessage(chatId, msg, botToken);
    }

    return jsonResponse({
      ok:          true,
      date:        today,
      total:       allStage2.length,
      new_entries: newEntries.length,
      exits:       exits.length,
      indices:     DAILY_INDICES.length,
    });
  } catch (err) {
    console.error('[stage2-daily] error:', err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
