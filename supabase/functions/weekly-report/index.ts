// POST /functions/v1/weekly-report
// Triggered every Monday at 08:00 Madrid time (07:00 UTC) via pg_cron.
// 1. Fetches real-time data for major indices + sector ETFs.
// 2. Scans SP100 + DAX40 + IBEX35 for Stage 2 stocks.
// 3. Generates a full qualitative Weinstein weekly report via Claude.
// 4. Sends it via Telegram and email to all registered users.
//
// Auth: x-cron-secret header.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getTechnicalSnapshot } from '../_shared/marketData.ts';
import { classifyStage } from '../_shared/weinstein.ts';
import { sendTelegramMessage } from '../_shared/telegram.ts';
import { generate } from '../_shared/anthropic.ts';

// ─── Config ────────────────────────────────────────────────────────────────

const INDICES = [
  { symbol: 'SPY',  name: 'S&P 500',   flag: '🇺🇸' },
  { symbol: 'QQQ',  name: 'NASDAQ 100', flag: '🇺🇸' },
  { symbol: 'IWM',  name: 'Russell 2000', flag: '🇺🇸' },
  { symbol: 'EWG',  name: 'DAX (Alemania)', flag: '🇩🇪' },
  { symbol: 'EWP',  name: 'IBEX 35 (España)', flag: '🇪🇸' },
  { symbol: 'GLD',  name: 'Oro', flag: '🥇' },
  { symbol: 'USO',  name: 'Petróleo WTI', flag: '🛢️' },
  { symbol: 'UUP',  name: 'Dólar (DXY)', flag: '💵' },
];

const SECTOR_ETFS = [
  { symbol: 'XLK',  name: 'Tecnología' },
  { symbol: 'XLF',  name: 'Financiero' },
  { symbol: 'XLE',  name: 'Energía' },
  { symbol: 'XLV',  name: 'Salud' },
  { symbol: 'XLI',  name: 'Industrial' },
  { symbol: 'XLY',  name: 'Consumo Discrecional' },
  { symbol: 'XLP',  name: 'Consumo Básico' },
  { symbol: 'XLB',  name: 'Materiales' },
  { symbol: 'XLC',  name: 'Comunicación' },
  { symbol: 'XLRE', name: 'Inmobiliario' },
  { symbol: 'XLU',  name: 'Utilities' },
];

const SCAN_UNIVERSE: Record<string, string[]> = {
  'S&P 100': [
    'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','JPM','LLY',
    'V','UNH','XOM','MA','JNJ','PG','COST','HD','ABBV','BAC','KO','WMT',
    'MRK','NFLX','CVX','CRM','AMD','ORCL','LIN','ACN','MCD','CSCO','PEP',
    'ABT','TXN','ADBE','AMGN','GE','CAT','NOW','INTU','QCOM','GS','RTX',
    'HON','BKNG','MS','DE','ISRG','PFE',
  ],
  'DAX 40': [
    'ADS.DE','AIR.DE','ALV.DE','BAS.DE','BAYN.DE','BMW.DE','SAP.DE',
    'SIE.DE','MUV2.DE','DTE.DE','DBK.DE','VOW3.DE','MBG.DE','RHM.DE',
    'IFX.DE','DHL.DE','EOAN.DE','BNR.DE','HEI.DE','LIN.DE',
  ],
  'IBEX 35': [
    'SAN.MC','BBVA.MC','ITX.MC','IBE.MC','TEF.MC','REP.MC','AMS.MC',
    'ANA.MC','AENA.MC','CABK.MC','FER.MC','ELE.MC','MAP.MC','IAG.MC',
    'NTGY.MC','BKT.MC','SAB.MC','ACX.MC','GRF.MC','COL.MC',
  ],
};

const MAX_CONCURRENT = 6;

async function pooledMap<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) { const i = idx++; results[i] = await fn(items[i]); }
  }
  await Promise.all(Array.from({ length: MAX_CONCURRENT }, worker));
  return results;
}

// ─── Market data helpers ───────────────────────────────────────────────────

interface IndexData {
  symbol: string;
  name: string;
  flag: string;
  price: number;
  changePercent: number;
  stage: string;
}

interface SectorData {
  symbol: string;
  name: string;
  changePercent: number;
  stage: string;
  distanceFromSMA: number | null;
}

async function fetchIndexData(): Promise<IndexData[]> {
  const results = await pooledMap(INDICES, async ({ symbol, name, flag }) => {
    try {
      const snap = await getTechnicalSnapshot(symbol);
      const cls  = classifyStage(snap);
      return { symbol, name, flag, price: snap.currentPrice, changePercent: snap.changePercent, stage: cls.stage };
    } catch {
      return null;
    }
  });
  return results.filter(Boolean) as IndexData[];
}

async function fetchSectorData(): Promise<SectorData[]> {
  const results = await pooledMap(SECTOR_ETFS, async ({ symbol, name }) => {
    try {
      const snap = await getTechnicalSnapshot(symbol);
      const cls  = classifyStage(snap);
      return { symbol, name, changePercent: snap.changePercent, stage: cls.stage, distanceFromSMA: snap.distanceFromSMA30Pct };
    } catch {
      return null;
    }
  });
  return results.filter(Boolean) as SectorData[];
}

async function scanStage2(): Promise<Array<{ ticker: string; name: string; price: number; currency: string; rs: number | null; confidence: string; index: string }>> {
  const allTickers = Object.entries(SCAN_UNIVERSE).flatMap(([idx, tickers]) =>
    tickers.map(t => ({ ticker: t, index: idx }))
  );

  const results = await pooledMap(allTickers, async ({ ticker, index }) => {
    try {
      const snap = await getTechnicalSnapshot(ticker);
      const cls  = classifyStage(snap);
      if (cls.stage === 'STAGE_2' && cls.confidence !== 'low' && snap.currentPrice >= 2) {
        return { ticker, name: snap.name, price: snap.currentPrice, currency: snap.currency, rs: snap.mansfieldRS, confidence: cls.confidence, index };
      }
      return null;
    } catch { return null; }
  });

  return (results.filter(Boolean) as NonNullable<typeof results[0]>[])
    .sort((a, b) => (b.rs ?? 0) - (a.rs ?? 0));
}

// ─── Claude report generator ───────────────────────────────────────────────

async function generateWeinsteinReport(
  indices: IndexData[],
  sectors: SectorData[],
  stage2: ReturnType<typeof scanStage2> extends Promise<infer T> ? T : never,
  weekStr: string,
): Promise<string> {
  const indicesText = indices.map(i =>
    `${i.flag} ${i.name}: ${i.price.toFixed(2)} (${i.changePercent >= 0 ? '+' : ''}${i.changePercent.toFixed(2)}%) — ${i.stage}`
  ).join('\n');

  const sectorsText = sectors
    .sort((a, b) => b.changePercent - a.changePercent)
    .map(s => `${s.name}: ${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}% | Stage: ${s.stage}`)
    .join('\n');

  const top10 = stage2.slice(0, 10).map(s =>
    `${s.ticker} (${s.index}) — ${s.price.toFixed(2)} ${s.currency} | RS: ${s.rs?.toFixed(1) ?? 'N/A'} | Confianza: ${s.confidence}`
  ).join('\n');

  const prompt = `Eres un analista experto en el método Stan Weinstein con más de 20 años de experiencia. Genera el informe semanal de mercado para la semana del ${weekStr}.

DATOS DE MERCADO EN TIEMPO REAL:

ÍNDICES PRINCIPALES:
${indicesText}

ROTACIÓN SECTORIAL (ETFs USA):
${sectorsText}

TOP VALORES EN STAGE 2 (${stage2.length} encontrados):
${top10}
${stage2.length > 10 ? `... y ${stage2.length - 10} más` : ''}

Genera un informe semanal profesional en español con las siguientes secciones:

1. **RESUMEN EJECUTIVO** (2-3 párrafos) — situación general del mercado esta semana, sesgo alcista/bajista, nivel de riesgo
2. **ANÁLISIS DE ÍNDICES** — analiza cada índice con perspectiva Weinstein: en qué stage está, si la SMA30 semanal es positiva, qué significa para el inversor
3. **ROTACIÓN SECTORIAL** — qué sectores están liderando (Stage 2) vs cuáles están fallando (Stage 3-4), implicaciones para la cartera
4. **CONTEXTO MACROECONÓMICO** — qué nos dicen el dólar, el oro y el petróleo sobre el entorno macro. Cómo afecta a la estrategia Weinstein
5. **MEJORES OPORTUNIDADES STAGE 2** — análisis de los 5 valores más destacados de la lista, por qué son interesantes desde el método Weinstein
6. **PUNTOS CLAVE PARA LA SEMANA** — 3-5 niveles o eventos a vigilar la próxima semana
7. **CONCLUSIÓN WEINSTEIN** — veredicto final: ¿es un mercado para comprar Stage 2 agresivamente, ser selectivo o reducir exposición?

Tono: profesional pero directo, basado en datos, sin rodeos. Usa los datos reales proporcionados.`;

  return generate({
    system: 'Eres un analista técnico experto en el método Weinstein. Tus informes son precisos, basados en datos y orientados a la acción. Siempre fundamentas tus análisis en la metodología de Stan Weinstein: stages, SMA30 semanal, volumen y Relative Strength de Mansfield.',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 3000,
  });
}

// ─── Email builder ─────────────────────────────────────────────────────────

function buildWeeklyReportEmail(report: string, weekStr: string, stage2Count: number, appUrl: string): string {
  // Convert markdown-style **bold** to <strong> and newlines to <br>
  const htmlReport = report
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p style="margin:0 0 16px;color:#cbd5e1;font-size:15px;line-height:1.7;">')
    .replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Informe Semanal Weinstein — ${weekStr}</title>
</head>
<body style="margin:0;padding:0;background:#0b1220;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1220;padding:40px 20px;">
  <tr><td align="center">
    <table width="620" cellpadding="0" cellspacing="0" style="background:#141c2e;border-radius:16px;overflow:hidden;border:1px solid #1e293b;">

      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);padding:40px 40px 32px;text-align:center;border-bottom:2px solid #f59e0b;">
          <div style="display:inline-block;background:#f59e0b;width:52px;height:52px;border-radius:14px;line-height:52px;font-size:26px;margin-bottom:16px;">⚡</div>
          <h1 style="margin:0 0 4px;color:#ffffff;font-size:26px;font-weight:900;letter-spacing:-0.5px;">ALPHA STAGE TERMINAL</h1>
          <p style="margin:0 0 16px;color:#f59e0b;font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;">Weinstein Pro Terminal</p>
          <div style="display:inline-block;background:#f59e0b18;border:1px solid #f59e0b44;border-radius:100px;padding:8px 24px;">
            <span style="color:#f59e0b;font-size:14px;font-weight:800;">📊 INFORME SEMANAL — ${weekStr.toUpperCase()}</span>
          </div>
        </td>
      </tr>

      <!-- Stats bar -->
      <tr>
        <td style="background:#1a2538;padding:20px 40px;border-bottom:1px solid #1e293b;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="text-align:center;padding:0 8px;">
                <div style="color:#10b981;font-size:28px;font-weight:900;">${stage2Count}</div>
                <div style="color:#64748b;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Valores Stage 2</div>
              </td>
              <td style="text-align:center;padding:0 8px;border-left:1px solid #1e293b;border-right:1px solid #1e293b;">
                <div style="color:#f59e0b;font-size:28px;font-weight:900;">3</div>
                <div style="color:#64748b;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Índices analizados</div>
              </td>
              <td style="text-align:center;padding:0 8px;">
                <div style="color:#6366f1;font-size:28px;font-weight:900;">11</div>
                <div style="color:#64748b;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Sectores escaneados</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Report content -->
      <tr>
        <td style="padding:40px;">
          <p style="margin:0 0 16px;color:#cbd5e1;font-size:15px;line-height:1.7;">${htmlReport}</p>
        </td>
      </tr>

      <!-- CTA -->
      <tr>
        <td style="padding:0 40px 40px;text-align:center;">
          <a href="${appUrl}"
             style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:#0b1220;text-decoration:none;font-weight:900;font-size:14px;padding:16px 40px;border-radius:12px;letter-spacing:0.5px;">
            ⚡ ABRIR TERMINAL Y ANALIZAR
          </a>
          <p style="margin:20px 0 0;color:#475569;font-size:12px;">
            Análisis generado con IA basado en el método Stan Weinstein.<br>
            No constituye asesoramiento financiero. Los mercados conllevan riesgo de pérdida de capital.
          </p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#0f172a;padding:24px 40px;text-align:center;border-top:1px solid #1e293b;">
          <p style="margin:0 0 8px;color:#334155;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">
            ALPHA STAGE TERMINAL — WEINSTEIN STRATEGY CERTIFIED
          </p>
          <p style="margin:0;color:#1e293b;font-size:10px;">
            © ${new Date().getFullYear()} Alpha Stage Terminal · <a href="${appUrl}" style="color:#334155;">weinsteinanalyst.com</a>
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

async function sendWeeklyEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) { console.warn('[weekly-report] RESEND_API_KEY not set, skipping email'); return; }
  const from = Deno.env.get('ALERT_FROM_EMAIL') ?? 'Weinstein Analyst <onboarding@resend.dev>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) {
    console.error(`[weekly-report] Resend error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

// ─── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // Auth
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
  const appUrl   = Deno.env.get('APP_URL') ?? 'https://www.alphastage.finance';

  // Week identifier (e.g. "semana del 5 de mayo de 2025")
  const now = new Date();
  const weekStr = now.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const weekLabel = `Semana del ${weekStr}`;

  console.log(`[weekly-report] Starting — ${weekLabel}`);

  // ── 1. Fetch market data in parallel ──────────────────────────────────────
  const [indices, sectors, stage2] = await Promise.all([
    fetchIndexData(),
    fetchSectorData(),
    scanStage2(),
  ]);

  console.log(`[weekly-report] Data fetched — ${indices.length} indices, ${sectors.length} sectors, ${stage2.length} Stage2`);

  // ── 2. Generate report via Claude ─────────────────────────────────────────
  const reportText = await generateWeinsteinReport(indices, sectors, stage2, weekLabel);
  console.log(`[weekly-report] Report generated (${reportText.length} chars)`);

  // ── 3. Build Telegram message ─────────────────────────────────────────────
  const spyData    = indices.find(i => i.symbol === 'SPY');
  const nasdaqData = indices.find(i => i.symbol === 'QQQ');
  const ibexData   = indices.find(i => i.symbol === 'EWP');
  const daxData    = indices.find(i => i.symbol === 'EWG');

  const formatPct = (v: number) => {
    const sign = v >= 0 ? '▲' : '▼';
    return `${sign} ${Math.abs(v).toFixed(2)}%`;
  };

  const indexLine = (flag: string, name: string, pct: number) => {
    const arrow = pct >= 0 ? '🟢' : '🔴';
    return `${arrow} ${flag} <b>${name}</b>   ${formatPct(pct)}`;
  };

  const topSectors = sectors
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 3)
    .map((s, i) => {
      const medals = ['🥇', '🥈', '🥉'];
      return `${medals[i]} <b>${s.name}</b>  ${formatPct(s.changePercent)}`;
    })
    .join('\n');

  const top5 = stage2.slice(0, 5)
    .map(s => {
      const rs = s.rs != null ? `RS ${s.rs.toFixed(1)}` : '';
      const price = `${s.price.toFixed(2)} ${s.currency}`;
      return `✅ <b>${s.ticker}</b>  <code>${price}</code>  ${rs}`;
    })
    .join('\n');

  // Executive summary — first substantial paragraph
  const execSummary = reportText
    .split('\n\n')
    .find(p => p.replace(/\*\*/g, '').trim().length > 120)
    ?.replace(/\*\*/g, '')
    .trim()
    .slice(0, 420) ?? '';

  const div = '━━━━━━━━━━━━━━━━━━━━━━';

  let tgMsg = `⚡️ <b>ALPHA STAGE · WEINSTEIN ANALYST</b>\n`;
  tgMsg += `${div}\n`;
  tgMsg += `📅 <b>${weekLabel.toUpperCase()}</b>\n\n`;

  tgMsg += `<b>📊 MERCADOS</b>\n`;
  if (spyData)    tgMsg += indexLine('🇺🇸', 'S&P 500', spyData.changePercent)    + '\n';
  if (nasdaqData) tgMsg += indexLine('🇺🇸', 'NASDAQ 100', nasdaqData.changePercent) + '\n';
  if (daxData)    tgMsg += indexLine('🇩🇪', 'DAX', daxData.changePercent)        + '\n';
  if (ibexData)   tgMsg += indexLine('🇪🇸', 'IBEX 35', ibexData.changePercent)   + '\n';

  tgMsg += `\n<b>🏆 SECTORES LÍDERES</b>\n${topSectors}\n`;

  tgMsg += `\n${div}\n`;
  tgMsg += `<b>🟢 STAGE 2 — ${stage2.length} valores detectados</b>\n${top5}\n`;
  if (stage2.length > 5) tgMsg += `<i>+${stage2.length - 5} más en el análisis completo</i>\n`;

  tgMsg += `\n${div}\n`;
  tgMsg += `<b>💡 ANÁLISIS SEMANAL</b>\n${execSummary}...\n`;

  tgMsg += `\n${div}\n`;
  tgMsg += `🔗 <a href="${appUrl}"><b>Ver informe completo → alphastage.finance</b></a>`;

  // ── 4. Post to public channel ──────────────────────────────────────────────
  const channelId = Deno.env.get('TELEGRAM_CHANNEL_ID') ?? '';
  let channelSent = false;
  if (botToken && channelId) {
    channelSent = await sendTelegramMessage(channelId, tgMsg, botToken);
    console.log(`[weekly-report] Channel post: ${channelSent ? 'OK' : 'FAILED'}`);
  }

  // ── 5. Fetch all users ─────────────────────────────────────────────────────
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, telegram_chat_id');

  if (!profiles || profiles.length === 0) {
    return jsonResponse({ sent: 0, stage2Found: stage2.length, channelSent });
  }

  // ── 6. Build email ─────────────────────────────────────────────────────────
  const emailHtml    = buildWeeklyReportEmail(reportText, weekLabel, stage2.length, appUrl);
  const emailSubject = `📊 Informe Semanal Weinstein — ${weekLabel}`;

  let emailsSent = 0;
  let telegramSent = 0;

  for (const profile of profiles as Array<{ id: string; email: string; telegram_chat_id: number | null }>) {
    // Telegram — all connected users
    if (botToken && profile.telegram_chat_id) {
      const ok = await sendTelegramMessage(profile.telegram_chat_id, tgMsg, botToken);
      if (ok) telegramSent++;
    }

    // Email — all registered users
    if (profile.email) {
      await sendWeeklyEmail(profile.email, emailSubject, emailHtml)
        .then(() => emailsSent++)
        .catch(err => console.error(`[weekly-report] Email failed for ${profile.id}:`, err));
    }
  }

  console.log(`[weekly-report] Done — Channel: ${channelSent}, Telegram: ${telegramSent}, Emails: ${emailsSent}`);

  return jsonResponse({
    week: weekLabel,
    stage2Found: stage2.length,
    channelSent,
    telegramSent,
    emailsSent,
    reportLength: reportText.length,
  });
});
