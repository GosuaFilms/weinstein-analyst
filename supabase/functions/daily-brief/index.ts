// POST /functions/v1/daily-brief
// Two modes:
//   Cron mode  — called with X-Cron-Secret header (no JWT). Processes ALL opted-in users.
//   Test mode  — called with Authorization header + { test: true }. Sends only to the caller.
//
// Required secrets: RESEND_API_KEY, CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY

import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { getTechnicalSnapshot } from '../_shared/marketData.ts';
import { classifyStage } from '../_shared/weinstein.ts';

// ─── Alert classifier (same as watchlist-scan) ───────────────────────────────

type AlertLevel =
  | 'RUPTURA' | 'EN_TENDENCIA' | 'EXTENDIDA'
  | 'CERCA' | 'VIGILAR' | 'BASE' | 'PRECAUCION' | 'SALIDA';

function classifyAlert(
  stage: string, dist: number | null, extended: boolean, dryUp: boolean | null,
): AlertLevel {
  const d = dist ?? 0;
  if (stage === 'STAGE_2') {
    if (d < 5) return 'RUPTURA';
    if (extended) return 'EXTENDIDA';
    return 'EN_TENDENCIA';
  }
  if (stage === 'STAGE_1') {
    const gap = Math.abs(d);
    if (dryUp || gap < 3) return 'CERCA';
    if (gap < 10) return 'VIGILAR';
    return 'BASE';
  }
  if (stage === 'STAGE_3') return 'PRECAUCION';
  return 'SALIDA';
}

interface ScannedItem {
  symbol: string; name: string; currency: string;
  currentPrice: number; stage: string; confidence: string;
  alert: AlertLevel; distanceFromSMA30Pct: number | null;
  mansfieldRS: number | null; suggestedStopLoss: number | null;
  stopLossRiskPct: number | null; error?: string;
}

const ALERT_ORDER: Record<AlertLevel, number> = {
  RUPTURA: 0, CERCA: 1, VIGILAR: 2, EN_TENDENCIA: 3,
  EXTENDIDA: 4, BASE: 5, PRECAUCION: 6, SALIDA: 7,
};

// ─── Scanner ─────────────────────────────────────────────────────────────────

async function scanSymbols(symbols: string[]): Promise<ScannedItem[]> {
  const items = await Promise.all(
    symbols.slice(0, 20).map(async (symbol) => {
      try {
        const snap = await getTechnicalSnapshot(symbol);
        const cls = classifyStage(snap);
        const alert = classifyAlert(cls.stage, snap.distanceFromSMA30Pct, snap.extendedStage2, snap.volumeDryUp);
        const r2 = (v: number | null | undefined) => v != null ? Math.round(v * 100) / 100 : null;
        const r1 = (v: number | null | undefined) => v != null ? Math.round(v * 10) / 10 : null;
        return {
          symbol: snap.symbol, name: snap.name, currency: snap.currency,
          currentPrice: r2(snap.currentPrice) ?? 0,
          stage: cls.stage, confidence: cls.confidence, alert,
          distanceFromSMA30Pct: r1(snap.distanceFromSMA30Pct),
          mansfieldRS: r2(snap.mansfieldRS),
          suggestedStopLoss: r2(snap.suggestedStopLoss),
          stopLossRiskPct: r1(snap.stopLossRiskPct),
        } satisfies ScannedItem;
      } catch (e) {
        return {
          symbol, name: symbol, currency: '', currentPrice: 0,
          stage: 'STAGE_1', confidence: 'low', alert: 'BASE' as AlertLevel,
          distanceFromSMA30Pct: null, mansfieldRS: null,
          suggestedStopLoss: null, stopLossRiskPct: null,
          error: (e as Error).message,
        };
      }
    })
  );
  return items.sort((a, b) => ALERT_ORDER[a.alert] - ALERT_ORDER[b.alert]);
}

// ─── Email HTML generator ─────────────────────────────────────────────────────

function alertColor(a: AlertLevel): string {
  const m: Record<AlertLevel, string> = {
    RUPTURA: '#10b981', EN_TENDENCIA: '#14b8a6', EXTENDIDA: '#eab308',
    CERCA: '#f97316', VIGILAR: '#3b82f6', BASE: '#94a3b8',
    PRECAUCION: '#f59e0b', SALIDA: '#ef4444',
  };
  return m[a] ?? '#94a3b8';
}

function alertLabel(a: AlertLevel): string {
  const m: Record<AlertLevel, string> = {
    RUPTURA: '🚀 RUPTURA', EN_TENDENCIA: '✅ TENDENCIA', EXTENDIDA: '⚠️ EXTENDIDA',
    CERCA: '👀 CERCA', VIGILAR: '📌 VIGILAR', BASE: '⏳ BASE',
    PRECAUCION: '🔶 PRECAUCIÓN', SALIDA: '🔴 SALIDA',
  };
  return m[a] ?? '⏳ BASE';
}

function formatPrice(item: ScannedItem): string {
  const sym = item.currency === 'USD' ? '$' : item.currency === 'EUR' ? '€' : item.currency + ' ';
  return sym + item.currentPrice.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function generateHtml(userName: string, items: ScannedItem[], dateStr: string): string {
  const urgent = items.filter(i => ['RUPTURA', 'CERCA'].includes(i.alert) && !i.error);
  const validItems = items.filter(i => !i.error);

  const urgentSection = urgent.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;margin-bottom:24px">
      <tr><td style="padding:20px">
        <div style="font-size:11px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:14px">
          ⚡ ${urgent.length} oportunidad${urgent.length > 1 ? 'es' : ''} detectada${urgent.length > 1 ? 's' : ''}
        </div>
        ${urgent.map(item => `
          <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #dcfce7;padding-bottom:10px;margin-bottom:10px">
            <tr>
              <td>
                <div style="font-weight:900;color:#0f172a;font-size:14px">${item.symbol}
                  <span style="background:#e2e8f0;color:#475569;font-size:10px;padding:1px 6px;border-radius:4px;margin-left:6px;font-weight:700">
                    E${item.stage.at(-1)}
                  </span>
                </div>
                <div style="color:#64748b;font-size:12px;margin-top:2px">${item.name}</div>
              </td>
              <td align="right">
                <span style="background:${alertColor(item.alert)};color:white;font-size:10px;font-weight:700;padding:3px 10px;border-radius:999px;display:inline-block;margin-bottom:4px">
                  ${alertLabel(item.alert)}
                </span><br>
                <span style="font-weight:700;color:#0f172a;font-size:13px">${formatPrice(item)}</span>
                ${item.distanceFromSMA30Pct != null ? `<span style="color:${item.distanceFromSMA30Pct >= 0 ? '#16a34a' : '#ef4444'};font-size:11px;margin-left:4px">${item.distanceFromSMA30Pct >= 0 ? '+' : ''}${item.distanceFromSMA30Pct.toFixed(1)}% MM30</span>` : ''}
              </td>
            </tr>
          </table>
        `).join('')}
      </td></tr>
    </table>
  ` : '';

  const tableRows = validItems.map(item => {
    const dist = item.distanceFromSMA30Pct;
    const distStr = dist != null ? `${dist >= 0 ? '+' : ''}${dist.toFixed(1)}%` : '–';
    const distColor = dist != null ? (dist >= 0 ? '#16a34a' : '#ef4444') : '#94a3b8';
    const rsStr = item.mansfieldRS != null ? `${item.mansfieldRS >= 0 ? '+' : ''}${item.mansfieldRS.toFixed(2)}` : '–';
    const rsColor = item.mansfieldRS != null ? (item.mansfieldRS >= 0 ? '#16a34a' : '#ef4444') : '#94a3b8';
    return `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;font-weight:900;color:#0f172a;font-size:13px">${item.symbol}
          <div style="font-weight:400;color:#94a3b8;font-size:11px">${item.name}</div>
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;text-align:center">
          <span style="background:${alertColor(item.alert)};color:white;font-size:9px;font-weight:700;padding:2px 7px;border-radius:999px;white-space:nowrap">${alertLabel(item.alert)}</span>
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;color:#0f172a;font-size:13px">${formatPrice(item)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;text-align:right;color:${distColor};font-size:12px;font-weight:700">${distStr}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;text-align:right;color:${rsColor};font-size:12px;font-weight:700">${rsStr}</td>
      </tr>
    `;
  }).join('');

  const emptyState = validItems.length === 0 ? `
    <div style="text-align:center;padding:40px 20px;color:#94a3b8">
      <div style="font-size:36px;margin-bottom:12px">⭐</div>
      <div style="font-size:13px;font-weight:600">Tu watchlist está vacía</div>
      <div style="font-size:12px;margin-top:6px">
        <a href="https://alphastage.finance" style="color:#f59e0b;text-decoration:none;font-weight:700">Añade activos en alphastage.finance →</a>
      </div>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Alpha Stage · Morning Brief</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9">
<tr><td align="center" style="padding:32px 16px">
<table cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(15,23,42,0.12)">

  <!-- ── Header ── -->
  <tr>
    <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:32px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:46px;height:46px;background:#f59e0b;border-radius:12px;text-align:center;vertical-align:middle;font-size:22px">⚡</td>
                <td style="padding-left:14px;vertical-align:middle">
                  <div style="color:white;font-weight:900;font-size:20px;letter-spacing:-0.5px;line-height:1">ALPHA STAGE</div>
                  <div style="color:#f59e0b;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:3px;margin-top:3px">Morning Brief · Weinstein Pro</div>
                </td>
              </tr>
            </table>
          </td>
          <td align="right" style="vertical-align:middle">
            <div style="color:#64748b;font-size:12px;font-weight:600">${dateStr}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ── Body ── -->
  <tr>
    <td style="background:white;padding:36px">
      <div style="font-size:15px;color:#334155;margin-bottom:28px;line-height:1.6">
        Hola <strong style="color:#0f172a">${userName}</strong> 👋<br>
        <span style="color:#64748b;font-size:13px">Estado de tu watchlist al inicio de la sesión.</span>
      </div>

      ${urgentSection}

      ${validItems.length > 0 ? `
        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;margin-bottom:14px">
          Tu Watchlist · ${validItems.length} activo${validItems.length !== 1 ? 's' : ''}
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #f1f5f9;border-radius:12px;overflow:hidden">
          <thead>
            <tr style="background:#f8fafc">
              <th style="padding:10px 8px;text-align:left;font-size:9px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px">Activo</th>
              <th style="padding:10px 8px;text-align:center;font-size:9px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px">Alerta</th>
              <th style="padding:10px 8px;text-align:right;font-size:9px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px">Precio</th>
              <th style="padding:10px 8px;text-align:right;font-size:9px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px">MM30</th>
              <th style="padding:10px 8px;text-align:right;font-size:9px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px">RS</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      ` : emptyState}
    </td>
  </tr>

  <!-- ── Footer ── -->
  <tr>
    <td style="background:#f8fafc;padding:24px;border-top:1px solid #e2e8f0">
      <div style="text-align:center">
        <a href="https://alphastage.finance" style="color:#f59e0b;font-weight:800;font-size:13px;text-decoration:none">alphastage.finance</a>
        <div style="color:#94a3b8;font-size:10px;margin-top:10px;line-height:1.7;max-width:480px;margin-left:auto;margin-right:auto">
          ⚠️ Herramienta educativa basada en el método Weinstein. No constituye asesoramiento financiero.<br>Los mercados conllevan riesgo de pérdida de capital.
        </div>
      </div>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ─── Send email via Resend ────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) { console.error('RESEND_API_KEY not set'); return false; }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      from: 'Alpha Stage <noreply@alphastage.finance>',
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`Resend error for ${to}: ${err.slice(0, 200)}`);
    return false;
  }
  return true;
}

// ─── Process one user ────────────────────────────────────────────────────────

async function processUser(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  email: string,
  userName: string,
): Promise<{ userId: string; email: string; success: boolean; symbols: number }> {
  try {
    // Get user's watchlist symbols
    const { data: wl } = await adminClient
      .from('watchlist')
      .select('symbol')
      .eq('user_id', userId)
      .order('added_at', { ascending: false });

    if (!wl?.length) return { userId, email, success: false, symbols: 0 };

    const symbols = wl.map(r => r.symbol);
    const items = await scanSymbols(symbols);

    const today = new Date().toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    const subject = `Morning Brief · ${new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}`;
    const html = generateHtml(userName, items, today);
    const ok = await sendEmail(email, subject, html);

    return { userId, email, success: ok, symbols: symbols.length };
  } catch (e) {
    console.error(`processUser ${userId}:`, e);
    return { userId, email, success: false, symbols: 0 };
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const cronSecret = Deno.env.get('CRON_SECRET');
  const isCron = cronSecret && req.headers.get('x-cron-secret') === cronSecret;
  const authHeader = req.headers.get('Authorization');

  if (!isCron && !authHeader) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const testMode = body.test === true;

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let targets: Array<{ userId: string; email: string; name: string }> = [];

    if (testMode && authHeader) {
      // Test mode: send only to the authenticated user
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (!user?.email) return jsonResponse({ error: 'Could not identify user' }, 400);
      const name = user.user_metadata?.name ?? user.email.split('@')[0];
      targets = [{ userId: user.id, email: user.email, name }];
    } else {
      // Cron mode: get all opted-in users with a watchlist
      // 1. Users who explicitly opted out
      const { data: optedOut } = await adminClient
        .from('user_settings')
        .select('user_id')
        .eq('daily_email_enabled', false);
      const excludeIds = new Set((optedOut ?? []).map(r => r.user_id));

      // 2. All users with watchlist items
      const { data: wlUsers } = await adminClient
        .from('watchlist')
        .select('user_id')
        .limit(500);

      const uniqueIds = [...new Set((wlUsers ?? []).map(r => r.user_id))].filter(id => !excludeIds.has(id));

      // 3. Fetch their auth data
      const emailPromises = uniqueIds.map(async (userId) => {
        const { data } = await adminClient.auth.admin.getUserById(userId);
        if (!data.user?.email) return null;
        const name = data.user.user_metadata?.name ?? data.user.email.split('@')[0];
        return { userId, email: data.user.email, name };
      });
      targets = (await Promise.all(emailPromises)).filter(Boolean) as typeof targets;
    }

    if (!targets.length) return jsonResponse({ message: 'No users to process', sent: 0 });

    // Process max 10 users concurrently to stay within timeout
    const results = await Promise.all(
      targets.slice(0, 50).map(t => processUser(adminClient, t.userId, t.email, t.name))
    );

    const sent = results.filter(r => r.success).length;
    console.log(`daily-brief: sent=${sent}/${results.length}`);

    return jsonResponse({
      sent,
      failed: results.length - sent,
      total: results.length,
      testMode,
    });
  } catch (err) {
    console.error('daily-brief error:', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
