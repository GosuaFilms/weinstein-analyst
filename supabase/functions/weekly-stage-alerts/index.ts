// POST /functions/v1/weekly-stage-alerts
// Fridays 22:30 UTC via pg_cron, after the weekly close.
// 1. Classifies the Weinstein stage of every symbol in any user's positions or watchlist
//    and stores it in symbol_weekly_stage (one row per symbol and week).
// 2. Diffs against the previous stored week and, per user, lists what changed:
//    positions that changed stage, closed at/below the user's stop, or whose
//    Weinstein stop has risen well above the user's; watchlist stocks that changed stage.
// 3. Sends it by Telegram (if linked) or email — only when something changed, once per week.
//
// Auth: x-cron-secret. Body (optional): { dry_run: true } → computes and returns the
// messages without sending or logging; { store_only: true } saves the week's stages and
// returns before any user is looked at (baseline); { week: 'YYYY-MM-DD' } overrides the week.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getTechnicalSnapshot } from '../_shared/marketData.ts';
import { classifyStage } from '../_shared/weinstein.ts';
import { trySendTelegram } from '../_shared/telegram.ts';
import { sendEmail } from '../_shared/email.ts';

const APP_URL = 'https://www.alphastage.finance';
// Only suggest raising the stop when the Weinstein stop is clearly higher
const STOP_RAISE_MIN_PCT = 3;

type Stage = 'STAGE_1' | 'STAGE_2' | 'STAGE_3' | 'STAGE_4';

interface SymbolState {
  symbol: string; name: string; stage: Stage; price: number;
  sma30: number | null; suggestedStop: number | null; currency: string;
}

interface Item { symbol: string; name: string; kind: 'position' | 'watch'; text: string; severity: number }

function fridayOf(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const back = (x.getUTCDay() + 2) % 7; // days since the last Friday (Fri → 0, Sat → 1, … Thu → 6)
  x.setUTCDate(x.getUTCDate() - back);
  return x.toISOString().slice(0, 10);
}

const STAGE_LABEL: Record<'es' | 'en', Record<Stage, string>> = {
  es: { STAGE_1: 'Etapa 1 (base)', STAGE_2: 'Etapa 2 (avance)', STAGE_3: 'Etapa 3 (techo)', STAGE_4: 'Etapa 4 (caída)' },
  en: { STAGE_1: 'Stage 1 (base)', STAGE_2: 'Stage 2 (advance)', STAGE_3: 'Stage 3 (top)', STAGE_4: 'Stage 4 (decline)' },
};

function money(v: number, currency: string) {
  return `${v.toFixed(2)} ${currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency}`;
}

function positionMeaning(to: Stage, es: boolean): string {
  switch (to) {
    case 'STAGE_4': return es ? 'Weinstein: salir, no se mantienen posiciones en Etapa 4.' : 'Weinstein: exit, no positions are held in Stage 4.';
    case 'STAGE_3': return es ? 'Posible techo: ajusta el stop justo bajo la MM30 o recoge parte del beneficio.' : 'Possible top: tighten the stop just under the MM30 or take partial profits.';
    case 'STAGE_1': return es ? 'Ha perdido la tendencia: revisa si mantenerla.' : 'The trend is gone: review whether to keep it.';
    case 'STAGE_2': return es ? 'Vuelve a la tendencia alcista.' : 'Back in the uptrend.';
  }
}

function watchMeaning(from: Stage, to: Stage, es: boolean): string {
  if (to === 'STAGE_2') return es ? 'Posible compra: analízala antes de entrar.' : 'Possible buy: analyze it before entering.';
  if (to === 'STAGE_4') return es ? 'Evitar: en Etapa 4 no se compra.' : 'Avoid: no buying in Stage 4.';
  if (to === 'STAGE_3') return es ? 'Pierde fuerza: no es momento de comprar.' : 'Losing strength: not the time to buy.';
  return from === 'STAGE_4'
    ? (es ? 'Deja de caer y empieza a formar base.' : 'Stops falling and starts basing.')
    : (es ? 'Vuelve a formar base.' : 'Back to basing.');
}

async function pooledMap<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) return jsonResponse({ error: 'forbidden' }, 403);

  const body = await req.json().catch(() => ({})) as { dry_run?: boolean; store_only?: boolean; week?: string };
  const dryRun = body.dry_run === true;
  const week = body.week ?? fridayOf(new Date());

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    // ── 1. Who follows what ────────────────────────────────────────────────
    const [{ data: positions, error: pe }, { data: watch, error: we }] = await Promise.all([
      db.from('portfolio_positions').select('user_id, symbol, name, stop_loss'),
      db.from('watchlist').select('user_id, symbol, name'),
    ]);
    if (pe || we) throw new Error((pe ?? we)!.message);
    const symbols = [...new Set([...(positions ?? []), ...(watch ?? [])].map((r) => String(r.symbol).toUpperCase()))];

    // ── 2. This week's stage per symbol ────────────────────────────────────
    const states = new Map<string, SymbolState>();
    await pooledMap(symbols, 6, async (symbol) => {
      try {
        const snap = await getTechnicalSnapshot(symbol, 30, { maxAgeMin: 120 });
        const cls = classifyStage(snap);
        states.set(symbol, {
          symbol, name: snap.name, stage: cls.stage as Stage, price: snap.currentPrice,
          sma30: snap.sma30Weekly, suggestedStop: snap.suggestedStopLoss, currency: snap.currency,
        });
      } catch (e) {
        console.warn(`[weekly-stage-alerts] ${symbol}: ${(e as Error).message}`);
      }
    });
    if (!dryRun && states.size) {
      const { error } = await db.from('symbol_weekly_stage').upsert([...states.values()].map((s) => ({
        symbol: s.symbol, week, stage: s.stage, price: s.price, sma30: s.sma30,
        suggested_stop: s.suggestedStop, currency: s.currency,
      })), { onConflict: 'symbol,week' });
      if (error) throw new Error(error.message);
    }

    if (body.store_only) {
      return jsonResponse({ ok: true, week, store_only: true, symbols: symbols.length, stored: dryRun ? 0 : states.size });
    }

    // ── 3. Previous week's stage per symbol ────────────────────────────────
    const prev = new Map<string, Stage>();
    if (symbols.length) {
      const { data } = await db.from('symbol_weekly_stage').select('symbol, week, stage')
        .in('symbol', symbols).lt('week', week).order('week', { ascending: false });
      for (const r of data ?? []) if (!prev.has(r.symbol)) prev.set(r.symbol, r.stage as Stage);
    }

    // ── 4. Per-user changes ────────────────────────────────────────────────
    const { data: profiles } = await db.from('profiles').select('id, email, telegram_chat_id, preferred_language');
    const { data: settings } = await db.from('user_settings').select('user_id, weekly_stage_alerts');
    const { data: sentRows } = await db.from('stage_alert_log').select('user_id').eq('week', week);
    const optedOut = new Set((settings ?? []).filter((s) => s.weekly_stage_alerts === false).map((s) => s.user_id));
    const alreadySent = new Set((sentRows ?? []).map((r) => r.user_id));

    const byUser = new Map<string, Item[]>();
    const push = (uid: string, it: Item) => (byUser.get(uid) ?? byUser.set(uid, []).get(uid)!).push(it);
    const langOf = new Map((profiles ?? []).map((p) => [p.id, (p.preferred_language === 'en' ? 'en' : 'es') as 'es' | 'en']));

    const positionKeys = new Set<string>();
    for (const p of positions ?? []) {
      const sym = String(p.symbol).toUpperCase();
      positionKeys.add(`${p.user_id}:${sym}`);
      const st = states.get(sym);
      if (!st) continue;
      const es = (langOf.get(p.user_id) ?? 'es') === 'es';
      const L = STAGE_LABEL[es ? 'es' : 'en'];
      const before = prev.get(sym);
      const name = p.name || st.name;
      if (p.stop_loss != null && st.price <= p.stop_loss) {
        push(p.user_id, { symbol: sym, name, kind: 'position', severity: 0,
          text: es ? `Ha cerrado la semana en ${money(st.price, st.currency)}, en o por debajo de tu stop (${money(p.stop_loss, st.currency)}).`
                   : `Closed the week at ${money(st.price, st.currency)}, at or below your stop (${money(p.stop_loss, st.currency)}).` });
      }
      if (before && before !== st.stage) {
        push(p.user_id, { symbol: sym, name, kind: 'position', severity: st.stage === 'STAGE_4' ? 0 : st.stage === 'STAGE_3' ? 1 : 2,
          text: `${L[before]} → <b>${L[st.stage]}</b>. ${positionMeaning(st.stage, es)}` });
      }
      if (st.stage === 'STAGE_2' && st.suggestedStop != null && p.stop_loss != null && p.stop_loss > 0 &&
          st.suggestedStop > p.stop_loss * (1 + STOP_RAISE_MIN_PCT / 100) && st.suggestedStop < st.price) {
        push(p.user_id, { symbol: sym, name, kind: 'position', severity: 3,
          text: es ? `Puedes subir el stop de ${money(p.stop_loss, st.currency)} a ${money(st.suggestedStop, st.currency)} (stop Weinstein actual).`
                   : `You can raise the stop from ${money(p.stop_loss, st.currency)} to ${money(st.suggestedStop, st.currency)} (current Weinstein stop).` });
      }
    }
    for (const w of watch ?? []) {
      const sym = String(w.symbol).toUpperCase();
      if (positionKeys.has(`${w.user_id}:${sym}`)) continue; // already covered as a position
      const st = states.get(sym);
      const before = prev.get(sym);
      if (!st || !before || before === st.stage) continue;
      const es = (langOf.get(w.user_id) ?? 'es') === 'es';
      const L = STAGE_LABEL[es ? 'es' : 'en'];
      push(w.user_id, { symbol: sym, name: w.name || st.name, kind: 'watch', severity: st.stage === 'STAGE_2' ? 1 : 2,
        text: `${L[before]} → <b>${L[st.stage]}</b>. ${watchMeaning(before, st.stage, es)}` });
    }

    // ── 5. Send ────────────────────────────────────────────────────────────
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const results: unknown[] = [];
    for (const profile of profiles ?? []) {
      const items = byUser.get(profile.id);
      if (!items?.length) continue;
      if (optedOut.has(profile.id)) { results.push({ user: profile.id.slice(0, 8), skipped: 'opted out' }); continue; }
      if (alreadySent.has(profile.id)) { results.push({ user: profile.id.slice(0, 8), skipped: 'already sent' }); continue; }
      const es = (langOf.get(profile.id) ?? 'es') === 'es';
      items.sort((a, b) => (a.kind === b.kind ? a.severity - b.severity : a.kind === 'position' ? -1 : 1));

      const section = (kind: Item['kind']) => items.filter((i) => i.kind === kind);
      const title = es ? `Revisión semanal Weinstein — ${week}` : `Weinstein weekly review — ${week}`;
      const tgLines = [`📋 <b>${title}</b>`, ''];
      const htmlParts = [`<h2 style="color:#fff;font-size:18px;margin:0 0 12px;">${title}</h2>`];
      for (const [kind, head] of [['position', es ? '💼 Tus posiciones' : '💼 Your positions'], ['watch', es ? '⭐ Tu watchlist' : '⭐ Your watchlist']] as const) {
        const list = section(kind);
        if (!list.length) continue;
        tgLines.push(`<b>${head}</b>`);
        htmlParts.push(`<h3 style="color:#f59e0b;font-size:14px;margin:18px 0 8px;">${head}</h3>`);
        for (const it of list) {
          tgLines.push(`• <b>${it.symbol}</b> — ${it.text}`);
          htmlParts.push(`<p style="margin:0 0 10px;"><b style="color:#fff;">${it.symbol}</b> <span style="color:#64748b;">${it.name}</span><br/>${it.text}</p>`);
        }
        tgLines.push('');
      }
      const footer = es
        ? 'Basado en el cierre semanal y las reglas de Weinstein. Herramienta educativa, no es asesoramiento financiero. Puedes desactivar este aviso en tu perfil.'
        : 'Based on the weekly close and Weinstein rules. Educational tool, not financial advice. You can turn this off in your profile.';
      tgLines.push(`<a href="${APP_URL}">${es ? 'Abrir Alpha Stage' : 'Open Alpha Stage'}</a>`, `<i>${footer}</i>`);
      htmlParts.push(`<p style="margin:20px 0 0;"><a href="${APP_URL}" style="display:inline-block;background:#f59e0b;color:#0f172a;font-weight:900;text-decoration:none;padding:10px 18px;border-radius:10px;">${es ? 'Abrir Alpha Stage' : 'Open Alpha Stage'}</a></p>`);

      const tgText = tgLines.join('\n');
      if (dryRun) { results.push({ user: profile.id.slice(0, 8), items: items.length, preview: tgText }); continue; }

      let channel: string | null = null;
      if (botToken && profile.telegram_chat_id) {
        const r = await trySendTelegram(profile.telegram_chat_id, tgText, botToken);
        if (r.ok) channel = 'telegram';
      }
      if (!channel && profile.email) {
        const ok = await sendEmail({
          to: profile.email,
          subject: es ? `📋 Revisión semanal: ${items.length} ${items.length === 1 ? 'cambio' : 'cambios'} en tus valores` : `📋 Weekly review: ${items.length} change${items.length === 1 ? '' : 's'} in your stocks`,
          bodyHtml: htmlParts.join(''),
          footer,
        });
        if (ok) channel = 'email';
      }
      if (channel) await db.from('stage_alert_log').insert({ user_id: profile.id, week, channel, items: items.length });
      results.push({ user: profile.id.slice(0, 8), items: items.length, channel: channel ?? 'failed' });
    }

    return jsonResponse({
      ok: true, week, dry_run: dryRun, symbols: symbols.length, classified: states.size,
      with_previous_week: [...states.keys()].filter((s) => prev.has(s)).length, users: results,
    });
  } catch (err) {
    console.error('[weekly-stage-alerts] error:', err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
