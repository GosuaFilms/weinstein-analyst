// POST /functions/v1/breakout-alerts — weekdays 22:40 UTC via pg_cron, after the scan.
// Tells Pro/Élite users about today's base breakouts (base_breakouts, written by
// stage2-daily) and, on Fridays, which of this week's breakouts the weekly close
// confirmed. Watchlist stocks first, marked ⭐. Telegram if linked, else e-mail.
// Nothing is sent on days without news, and never twice a day.
//
// Auth: x-cron-secret. Body: { dry_run: true } → returns the messages, sends nothing;
// { date: 'YYYY-MM-DD' } overrides the day.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { trySendTelegram } from '../_shared/telegram.ts';
import { sendEmail } from '../_shared/email.ts';
import { STRONG_VOLUME } from '../_shared/breakouts.ts';

const SITE = 'https://www.alphastage.finance';
const MAX_ITEMS = 12;

interface Breakout {
  symbol: string; slug: string; name: string | null; currency: string | null; kind: 'base' | 'continuation';
  resistance: number; entry_level: number; price: number; rs: number | null; benchmark_stage: string | null;
  detected_on: string; confirmed: boolean | null; confirmed_on: string | null; volume_ratio: number | null; failed_on: string | null;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 2 });
const utm = 'utm_source=alerta&utm_medium=ruptura';

function line(b: Breakout, starred: boolean, html: boolean): string {
  const kind = b.kind === 'base' ? 'sale de su base' : 'nuevo máximo en Etapa 2';
  const rs = b.rs != null ? ` · FR ${b.rs > 0 ? '+' : ''}${b.rs.toFixed(1).replace('.', ',')}` : '';
  const market = b.benchmark_stage === 'STAGE_4' ? ' · ⚠ mercado en Etapa 4' : '';
  // Found on Friday's scan: the weekly close already says whether it holds
  const weekly = b.confirmed_on === b.detected_on && b.volume_ratio != null
    ? ` · cierre semanal con volumen ${b.volume_ratio.toFixed(1).replace('.', ',')}×${b.volume_ratio >= STRONG_VOLUME ? ' ✅' : ''}`
    : '';
  const text = `${starred ? '⭐ ' : ''}<b>${esc(b.symbol)}</b> ${esc(b.name ?? '')} — ${kind}: ${num(b.price)} sobre la resistencia ${num(b.resistance)}${rs}${weekly}${market}`;
  const link = `${SITE}/valor/${b.slug}?${utm}`;
  return html
    ? `<p style="margin:0 0 10px;">${text}<br/><a href="${link}" style="color:#f59e0b;font-size:12px;">Ver ficha</a> · <a href="${SITE}/?analizar=${encodeURIComponent(b.symbol)}&${utm}" style="color:#f59e0b;font-size:12px;">Analizar</a></p>`
    : `• ${text} · <a href="${link}">ficha</a>`;
}

function confirmLine(b: Breakout, starred: boolean, html: boolean): string {
  const vol = b.volume_ratio != null ? `${b.volume_ratio.toFixed(1).replace('.', ',')}×` : '—';
  const verdict = b.confirmed
    ? (b.volume_ratio != null && b.volume_ratio >= STRONG_VOLUME ? `✅ confirmada con volumen ${vol}` : `✔ cierra sobre la resistencia, pero con volumen ${vol} (Weinstein quiere 2× o más)`)
    : '✖ no aguanta: la semana cierra por debajo del punto de entrada';
  const text = `${starred ? '⭐ ' : ''}<b>${esc(b.symbol)}</b> — ${verdict}`;
  return html ? `<p style="margin:0 0 8px;">${text}</p>` : `• ${text}`;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) return jsonResponse({ error: 'forbidden' }, 403);
  const body = await req.json().catch(() => ({})) as { dry_run?: boolean; date?: string };
  const day = body.date ?? new Date().toISOString().slice(0, 10);
  const isFriday = new Date(`${day}T12:00:00Z`).getUTCDay() === 5;
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const cols = 'symbol, slug, name, currency, kind, resistance, entry_level, price, rs, benchmark_stage, detected_on, confirmed, confirmed_on, volume_ratio, failed_on';
  const [{ data: fresh }, { data: closed }] = await Promise.all([
    db.from('base_breakouts').select(cols).eq('detected_on', day).is('failed_on', null).order('rs', { ascending: false }),
    isFriday ? db.from('base_breakouts').select(cols).eq('confirmed_on', day).lt('detected_on', day) : Promise.resolve({ data: [] }),
  ]);
  const news = (fresh ?? []) as Breakout[];
  const confirmations = (closed ?? []) as Breakout[];
  if (!news.length && !confirmations.length) return jsonResponse({ ok: true, day, news: 0, sent: 0 });

  const [{ data: users }, { data: settings }, { data: sentRows }, { data: watch }] = await Promise.all([
    db.from('profiles').select('id, email, telegram_chat_id').in('plan', ['pro', 'elite']),
    db.from('user_settings').select('user_id, breakout_alerts'),
    db.from('breakout_alert_log').select('user_id').eq('day', day),
    db.from('watchlist').select('user_id, symbol'),
  ]);
  const optedOut = new Set((settings ?? []).filter((s) => s.breakout_alerts === false).map((s) => s.user_id));
  const sent = new Set((sentRows ?? []).map((r) => r.user_id));
  const watchOf = new Map<string, Set<string>>();
  for (const w of watch ?? []) (watchOf.get(w.user_id) ?? watchOf.set(w.user_id, new Set()).get(w.user_id)!).add(String(w.symbol).toUpperCase());

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const results: unknown[] = [];
  for (const u of users ?? []) {
    if (optedOut.has(u.id) || sent.has(u.id)) continue;
    const mine = watchOf.get(u.id) ?? new Set<string>();
    const order = (a: Breakout, b: Breakout) => Number(mine.has(b.symbol)) - Number(mine.has(a.symbol));
    const n = [...news].sort(order).slice(0, MAX_ITEMS);
    const c = [...confirmations].sort(order).slice(0, MAX_ITEMS);
    const title = n.length ? `🚀 ${n.length} ${n.length === 1 ? 'ruptura de base' : 'rupturas de base'} hoy` : '📋 Rupturas de la semana: cierre del viernes';

    const tg = [`<b>${title}</b>`, ''];
    const html = [`<h2 style="color:#fff;font-size:18px;margin:0 0 12px;">${title}</h2>`];
    if (n.length) {
      tg.push(...n.map((b) => line(b, mine.has(b.symbol), false)));
      if (news.length > n.length) tg.push(`… y ${news.length - n.length} más en la app`);
      tg.push('', isFriday
        ? '<i>Weinstein busca volumen de la semana ≥2× su media en la ruptura.</i>'
        : '<i>Se confirma con el cierre del viernes: precio sobre la resistencia y volumen de la semana ≥2× su media.</i>', '');
      html.push(...n.map((b) => line(b, mine.has(b.symbol), true)));
      html.push('<p style="color:#94a3b8;font-size:12px;">Weinstein compra la ruptura cuando el precio supera la resistencia de la base con volumen (2× la media o más) y la MM30 deja de bajar. Se confirma con el cierre semanal.</p>');
    }
    if (c.length) {
      tg.push('<b>Cierre de la semana</b>', ...c.map((b) => confirmLine(b, mine.has(b.symbol), false)), '');
      html.push('<h3 style="color:#f59e0b;font-size:14px;margin:18px 0 8px;">Cierre de la semana</h3>', ...c.map((b) => confirmLine(b, mine.has(b.symbol), true)));
    }
    const footer = 'Aviso de Alpha Stage Pro. Herramienta educativa, no es asesoramiento financiero. Puedes desactivarlo en tu perfil → Notificaciones → «Rupturas de base».';
    tg.push(`<a href="${SITE}/?${utm}">Abrir Alpha Stage</a>`, `<i>${footer}</i>`);
    const tgText = tg.join('\n');

    if (body.dry_run) { results.push({ user: u.id.slice(0, 8), news: n.length, confirmations: c.length, preview: tgText }); continue; }

    let channel: string | null = null;
    if (botToken && u.telegram_chat_id) {
      const r = await trySendTelegram(u.telegram_chat_id, tgText, botToken);
      if (r.ok) channel = 'telegram';
    }
    if (!channel && u.email) {
      const ok = await sendEmail({ to: u.email, subject: title, bodyHtml: html.join(''), footer });
      if (ok) channel = 'email';
    }
    if (channel) await db.from('breakout_alert_log').insert({ user_id: u.id, day, channel, items: n.length + c.length });
    results.push({ user: u.id.slice(0, 8), channel: channel ?? 'failed' });
  }
  return jsonResponse({ ok: true, day, news: news.length, confirmations: confirmations.length, dry_run: !!body.dry_run, users: results });
});
