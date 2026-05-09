// Email helper — uses Resend (https://resend.com) via raw fetch.
// Required secrets:  RESEND_API_KEY  and  ALERT_FROM_EMAIL
// Free tier: 3 000 emails / month, 100 / day.

const RESEND_API = 'https://api.resend.com/emails';

function getKey(): string {
  const k = Deno.env.get('RESEND_API_KEY');
  if (!k) throw new Error('RESEND_API_KEY not configured');
  return k;
}

function fromAddress(): string {
  return Deno.env.get('ALERT_FROM_EMAIL') ?? 'Weinstein Alerts <onboarding@resend.dev>';
}

export interface AlertEmailPayload {
  to: string;
  ticker: string;
  companyName?: string;
  condition: string;
  message: string;
  price: number;
  currency: string;
  appUrl?: string;
}

const CONDITION_META: Record<string, { emoji: string; label: string; color: string }> = {
  PRICE_CROSS_SMA30_UP:   { emoji: '📈', label: 'Precio cruza MM30 al alza',  color: '#10b981' },
  PRICE_CROSS_SMA30_DOWN: { emoji: '📉', label: 'Precio cruza MM30 a la baja', color: '#f43f5e' },
  VOLUME_SURGE:           { emoji: '💥', label: 'Explosión de volumen',         color: '#f59e0b' },
  RESISTANCE_BREAKOUT:    { emoji: '🚀', label: 'Ruptura de Resistencia',       color: '#10b981' },
  SUPPORT_BREAKDOWN:      { emoji: '⚠️', label: 'Ruptura de Soporte',           color: '#f43f5e' },
};

function buildHtml(p: AlertEmailPayload): string {
  const meta = CONDITION_META[p.condition] ?? { emoji: '🔔', label: p.condition, color: '#6366f1' };
  const sym = p.currency === 'USD' ? '$' : p.currency + ' ';
  const priceStr = `${sym}${p.price.toFixed(2)}`;
  const url = p.appUrl ?? 'https://www.alphastage.finance';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Alerta Weinstein — ${p.ticker}</title>
</head>
<body style="margin:0;padding:0;background:#0b1220;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1220;padding:40px 20px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#141c2e;border-radius:16px;overflow:hidden;border:1px solid #1e293b;">

      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,#1e293b,#0f172a);padding:32px;text-align:center;border-bottom:1px solid #1e293b;">
          <div style="display:inline-block;background:#f59e0b;width:44px;height:44px;border-radius:10px;line-height:44px;font-size:22px;margin-bottom:12px;">⚡</div>
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:900;letter-spacing:-0.5px;">ALPHA STAGE</h1>
          <p style="margin:4px 0 0;color:#f59e0b;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">Weinstein Pro Terminal</p>
        </td>
      </tr>

      <!-- Alert badge -->
      <tr>
        <td style="padding:32px 32px 0;text-align:center;">
          <div style="display:inline-block;background:${meta.color}18;border:1px solid ${meta.color}44;border-radius:100px;padding:8px 20px;margin-bottom:20px;">
            <span style="color:${meta.color};font-size:13px;font-weight:700;">${meta.emoji} ${meta.label}</span>
          </div>
          <h2 style="margin:0 0 8px;color:#ffffff;font-size:36px;font-weight:900;letter-spacing:-1px;">${p.ticker}</h2>
          ${p.companyName ? `<p style="margin:0 0 4px;color:#94a3b8;font-size:14px;">${p.companyName}</p>` : ''}
          <p style="margin:12px 0 0;color:#ffffff;font-size:28px;font-weight:700;">${priceStr}</p>
        </td>
      </tr>

      <!-- Message -->
      <tr>
        <td style="padding:24px 32px;">
          <div style="background:#1e293b;border-left:3px solid ${meta.color};border-radius:8px;padding:16px 20px;">
            <p style="margin:0;color:#e2e8f0;font-size:15px;line-height:1.6;">${p.message}</p>
          </div>
        </td>
      </tr>

      <!-- CTA -->
      <tr>
        <td style="padding:0 32px 32px;text-align:center;">
          <a href="${url}?ticker=${encodeURIComponent(p.ticker)}"
             style="display:inline-block;background:#10b981;color:#0b1220;text-decoration:none;font-weight:900;font-size:14px;padding:14px 32px;border-radius:12px;letter-spacing:0.5px;">
            📊 ANALIZAR ${p.ticker} AHORA
          </a>
          <p style="margin:16px 0 0;color:#475569;font-size:11px;">
            Alerta generada automáticamente · <a href="${url}/settings" style="color:#64748b;">Gestionar alertas</a>
          </p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#0f172a;padding:20px 32px;text-align:center;border-top:1px solid #1e293b;">
          <p style="margin:0;color:#334155;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">
            ALPHA STAGE TERMINAL — WEINSTEIN STRATEGY CERTIFIED
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export async function sendAlertEmail(payload: AlertEmailPayload): Promise<void> {
  const meta = CONDITION_META[payload.condition] ?? { emoji: '🔔', label: payload.condition, color: '' };
  const subject = `${meta.emoji} Alerta ${payload.ticker}: ${meta.label}`;

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [payload.to],
      subject,
      html: buildHtml(payload),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`Resend error ${res.status}: ${err.slice(0, 200)}`);
    // Don't throw — a failed email must never break the alert pipeline
  }
}
