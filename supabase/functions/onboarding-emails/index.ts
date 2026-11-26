// /functions/v1/onboarding-emails — welcome e-mails for new accounts.
//
// POST + x-cron-secret (hourly cron): sends every step due now (onboarding_due()):
//   welcome  how to run a first analysis
//   day2     today's Stage 2 stocks, only to users who haven't analysed anything
//   day7     first week: analyses left, the invite link
//   Body { dry_run: true } lists who is due without sending; { preview: 'welcome'|'day2'|'day7' }
//   returns that e-mail's HTML for a sample user (nothing is sent or stored).
// GET/POST ?u=<user id>&t=<signature>: one-click unsubscribe (link and
//   List-Unsubscribe header in every e-mail), no login needed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email.ts';

const SITE = 'https://www.alphastage.finance';
const FN_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/onboarding-emails`;

type Step = 'welcome' | 'day2' | 'day7';
interface Due { user_id: string; email: string; name: string; step: Step; analyses: number }
interface Pick { symbol: string; slug: string; name: string | null; rs: number | null; distance_pct: number | null }

// deno-lint-ignore no-explicit-any
type Db = any;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const utm = (step: Step) => `utm_source=email&utm_medium=onboarding&utm_campaign=${step}`;
const firstName = (n: string) => esc(n.trim().split(/\s+/)[0] || n);

async function signature(userId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`onboarding-unsubscribe:${userId}`));
  return [...new Uint8Array(sig)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const button = (href: string, label: string) =>
  `<p style="margin:24px 0;text-align:center;"><a href="${href}" style="display:inline-block;background:#f59e0b;color:#0b1220;text-decoration:none;font-weight:900;font-size:15px;padding:14px 28px;border-radius:12px;">${label}</a></p>`;

/** Strongest Stage 2 stocks of the last scan that are not extended, best sectors first. */
async function stage2Picks(db: Db, n: number): Promise<Pick[]> {
  const { data } = await db.from('stock_pages').select('symbol, slug, name, rs, distance_pct, sector_etf')
    .eq('stage', 'STAGE_2').eq('extended', false).order('rs', { ascending: false }).limit(40);
  const rows = (data ?? []) as (Pick & { sector_etf: string | null })[];
  const { data: sec } = await db.from('sector_ranking').select('etf, stage, scan_date').order('scan_date', { ascending: false }).limit(40);
  const strong = new Set(((sec ?? []) as { etf: string; stage: string }[]).filter((s) => s.stage === 'STAGE_2').map((s) => s.etf));
  return [...rows.filter((r) => r.sector_etf && strong.has(r.sector_etf)), ...rows.filter((r) => !r.sector_etf || !strong.has(r.sector_etf))].slice(0, n);
}

function picksTable(picks: Pick[], step: Step): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0;border-collapse:collapse;">${picks.map((p) => `
<tr style="border-bottom:1px solid #1e293b;">
  <td style="padding:10px 0;"><a href="${SITE}/valor/${p.slug}?${utm(step)}" style="color:#ffffff;font-weight:900;text-decoration:none;">${esc(p.symbol)}</a><br/><span style="color:#64748b;font-size:12px;">${esc(p.name ?? '')}</span></td>
  <td style="padding:10px 0;text-align:right;color:#94a3b8;font-size:12px;">FR ${p.rs != null ? (p.rs > 0 ? '+' : '') + p.rs.toFixed(1).replace('.', ',') : '—'}<br/>${p.distance_pct != null ? `+${p.distance_pct.toFixed(1).replace('.', ',')} % s/MM30` : ''}</td>
  <td style="padding:10px 0 10px 12px;text-align:right;"><a href="${SITE}/?analizar=${encodeURIComponent(p.symbol)}&${utm(step)}" style="color:#f59e0b;font-weight:700;font-size:12px;text-decoration:none;">Analizar →</a></td>
</tr>`).join('')}</table>`;
}

async function build(db: Db, u: Due, sampleCode?: string): Promise<{ subject: string; body: string }> {
  const hi = `<p style="margin:0 0 16px;color:#ffffff;font-size:18px;font-weight:700;">Hola, ${firstName(u.name)}:</p>`;

  if (u.step === 'welcome') {
    const [pick] = await stage2Picks(db, 1);
    const { data: usage } = await db.rpc('ai_usage_for', { p_user: u.user_id });
    const extra = Number((usage as Record<string, unknown> | null)?.bonus_left ?? 0);
    return {
      subject: 'Te damos la bienvenida a Alpha Stage: tu primer análisis en un minuto',
      body: `${hi}
<p>Alpha Stage aplica el método de <strong style="color:#fff;">Stan Weinstein</strong>: todo valor pasa por cuatro etapas (base, subida, techo y caída) y solo se compra en la <strong style="color:#34d399;">Etapa 2</strong>, cuando el precio está sobre una media de 30 semanas que sube.</p>
<p style="margin-top:20px;color:#fff;font-weight:700;">Tu primer análisis:</p>
<ol style="padding-left:20px;margin:8px 0;">
  <li>Escribe un ticker: <strong style="color:#fff;">SAN.MC</strong>, <strong style="color:#fff;">ITX.MC</strong>, <strong style="color:#fff;">AAPL</strong>…</li>
  <li>Pulsa <strong style="color:#fff;">Analizar</strong>.</li>
  <li>Lee la etapa, el veredicto y el plan con entrada y stop.</li>
</ol>
${button(`${SITE}/${pick ? `?analizar=${encodeURIComponent(pick.symbol)}&` : '?'}${utm('welcome')}`, pick ? `Analizar ${esc(pick.symbol)} ahora` : 'Hacer mi primer análisis')}
${pick ? `<p style="color:#94a3b8;font-size:13px;">${esc(pick.symbol)} (${esc(pick.name ?? '')}) es uno de los valores más fuertes en Etapa 2 hoy. Puedes cambiarlo por el que quieras.</p>` : ''}
<p>Tienes <strong style="color:#fff;">3 análisis gratis cada mes</strong>${extra > 0 ? ` y <strong style="color:#34d399;">${extra} extra</strong> por venir invitado` : ''}. Sin tarjeta.</p>
<p>Y sin gastar análisis: la <a href="${SITE}/etapa-2?${utm('welcome')}" style="color:#f59e0b;">lista de valores en Etapa 2 de hoy</a> y la <a href="${SITE}/valores?${utm('welcome')}" style="color:#f59e0b;">etapa de cada valor</a> del IBEX, S&P 100, NASDAQ y Europa, actualizadas cada día.</p>`,
    };
  }

  if (u.step === 'day2') {
    const picks = await stage2Picks(db, 5);
    return {
      subject: `${picks.length || 5} valores en Etapa 2 para tu primer análisis`,
      body: `${hi}
<p>Todavía no has hecho tu primer análisis. Para ponértelo fácil, estos son valores en <strong style="color:#34d399;">Etapa 2</strong> según el último cierre: con fuerza relativa positiva, sin estar extendidos y, cuando es posible, en sectores que también suben.</p>
${picksTable(picks, 'day2')}
<p style="color:#94a3b8;font-size:13px;">Estar en Etapa 2 no basta para comprar. El análisis revisa la base, el volumen de la ruptura y el mercado, y te da un plan con entrada y stop.</p>
${button(`${SITE}/?${picks[0] ? `analizar=${encodeURIComponent(picks[0].symbol)}&` : ''}${utm('day2')}`, 'Hacer mi primer análisis')}`,
    };
  }

  // day7
  const [{ data: usage }, { data: code }] = await Promise.all([
    db.rpc('ai_usage_for', { p_user: u.user_id }),
    sampleCode ? Promise.resolve({ data: sampleCode }) : db.rpc('referral_code_for', { p_user: u.user_id }),
  ]);
  const us = (usage ?? {}) as Record<string, unknown>;
  const plan = String(us.plan ?? 'free');
  const extra = Number(us.bonus_left ?? 0);
  const usedMonth = Number(us.analysis_month ?? 0);
  const left = plan === 'free' ? Math.max(0, 3 - usedMonth) : null;
  const link = `${SITE}/?ref=${code}`;
  const status = u.analyses > 0
    ? `<p>En tu primera semana has hecho <strong style="color:#fff;">${u.analyses} análisis</strong>.${left != null ? ` Te ${left === 1 ? 'queda' : 'quedan'} <strong style="color:#fff;">${left}</strong> este mes` : ''}${extra > 0 ? `${left != null ? ',' : ' Tienes'} más <strong style="color:#34d399;">${extra} extra</strong>` : ''}${left != null || extra > 0 ? '.' : ''}</p>`
    : `<p>Aún no has hecho tu primer análisis: tienes <strong style="color:#fff;">3 gratis este mes</strong>${extra > 0 ? ` y ${extra} extra` : ''}. ${`<a href="${SITE}/?${utm('day7')}" style="color:#f59e0b;">Empieza por cualquier valor que tengas en cartera</a>`}.</p>`;
  return {
    subject: 'Tu primera semana en Alpha Stage',
    body: `${hi}
${status}
<p style="margin-top:20px;color:#fff;font-weight:700;">El hábito Weinstein: revisar cada viernes</p>
<p>Weinstein no mira el gráfico cada día: revisa el cierre semanal. Si sigues valores en tu watchlist o tu cartera, cada viernes tras el cierre te avisamos de los cambios de etapa y de los stops que conviene subir. Lo puedes ajustar en tu perfil → Notificaciones.</p>
<p style="margin-top:20px;color:#fff;font-weight:700;">Invita a un amigo y gana análisis</p>
<p>Con tu enlace, tu amigo recibe <strong style="color:#fff;">3 análisis extra</strong> al registrarse y tú <strong style="color:#fff;">5</strong> cuando haga su primer análisis:</p>
<p style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:12px;font-family:monospace;color:#f59e0b;word-break:break-all;">${link}</p>
${plan === 'free' ? `<p style="color:#94a3b8;font-size:13px;">¿Necesitas más? El plan <a href="${SITE}/precios?${utm('day7')}" style="color:#f59e0b;">Pro</a> incluye 40 análisis al mes, alertas por Telegram y backtest.</p>` : ''}
${button(`${SITE}/?${utm('day7')}`, 'Abrir Alpha Stage')}`,
  };
}

async function footerFor(userId: string): Promise<{ html: string; url: string }> {
  const url = `${FN_URL}?u=${userId}&t=${await signature(userId)}`;
  return {
    url,
    html: `Herramienta educativa basada en el método Weinstein; no es asesoramiento financiero.<br/>
Recibes este correo porque acabas de crear una cuenta en Alpha Stage. Son solo tres mensajes de bienvenida.
<a href="${url}" style="color:#94a3b8;">Darme de baja de estos correos</a>.<br/>© ${new Date().getFullYear()} Gosua Films S.L. · <a href="${SITE}" style="color:#64748b;">alphastage.finance</a>`,
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const url = new URL(req.url);

  // One-click unsubscribe (link or List-Unsubscribe-Post), no login
  const u = url.searchParams.get('u');
  if (u) {
    const t = url.searchParams.get('t') ?? '';
    const valid = /^[0-9a-f-]{36}$/.test(u) && t === await signature(u);
    if (valid) {
      await db.from('user_settings').upsert({ user_id: u, onboarding_emails: false, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    }
    if (req.method === 'POST') return new Response(valid ? 'ok' : 'invalid', { status: valid ? 200 : 400 });
    return Response.redirect(`${SITE}/baja?lista=bienvenida&ok=${valid ? 1 : 0}`, 302);
  }

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) return jsonResponse({ error: 'forbidden' }, 403);
  const body = await req.json().catch(() => ({})) as { dry_run?: boolean; preview?: Step };

  if (body.preview) {
    const sample: Due = { user_id: '00000000-0000-0000-0000-000000000000', email: 'preview', name: 'Ana', step: body.preview, analyses: 2 };
    // Preview never creates an invite code for the sample user
    const built = await build(db, sample, 'abc2345');
    const f = await footerFor(sample.user_id);
    return jsonResponse({ subject: built.subject, body: built.body, footer: f.html });
  }

  const { data, error } = await db.rpc('onboarding_due');
  if (error) return jsonResponse({ error: error.message }, 500);
  const due = (data ?? []) as Due[];
  if (body.dry_run) return jsonResponse({ due: due.map((d) => ({ step: d.step, analyses: d.analyses })) });

  let sent = 0, failed = 0;
  for (const d of due.slice(0, 80)) {
    try {
      const { subject, body: html } = await build(db, d);
      const f = await footerFor(d.user_id);
      // Claim the step first so a retry or a parallel run never sends it twice
      const { error: claimErr } = await db.from('onboarding_emails').insert({ user_id: d.user_id, step: d.step });
      if (claimErr) continue;
      const ok = await sendEmail({
        to: d.email, subject, bodyHtml: html, footer: f.html,
        headers: { 'List-Unsubscribe': `<${f.url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      });
      if (ok) sent++;
      else {
        failed++;
        await db.from('onboarding_emails').delete().eq('user_id', d.user_id).eq('step', d.step); // retry next hour
      }
    } catch (e) {
      failed++;
      console.error('[onboarding-emails]', d.step, (e as Error).message);
    }
  }
  return jsonResponse({ due: due.length, sent, failed });
});
