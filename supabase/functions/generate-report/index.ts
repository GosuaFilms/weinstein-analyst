// POST /functions/v1/generate-report
// Body: { ticker: string }
// Returns: { html: string } or { error: 'no_fundamentals' } if real data unavailable.
//
// Data sources (all real, current):
//   - TwelveData  → live price, 52W range, exchange
//   - FMP         → company profile, quarterly income statement, analyst estimates
//   - Claude      → HTML layout + narrative (fed real numbers, NOT its training data)
//
// If FMP has no fundamental data for the ticker → returns error, report NOT generated.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const TD_BASE  = 'https://api.twelvedata.com';
const FMP_BASE = 'https://financialmodelingprep.com/stable';  // new API (post Aug 2025)
const ANT_API  = 'https://api.anthropic.com/v1/messages';
const MODEL     = 'claude-sonnet-4-6';
const MAX_TOKENS = 10000;

// ── TwelveData: live price + 52W range ───────────────────────────────────────
async function fetchQuote(ticker: string, tdKey: string) {
  try {
    const [priceRes, quoteRes] = await Promise.all([
      fetch(`${TD_BASE}/price?symbol=${encodeURIComponent(ticker)}&apikey=${tdKey}`),
      fetch(`${TD_BASE}/quote?symbol=${encodeURIComponent(ticker)}&apikey=${tdKey}`),
    ]);
    const [priceData, quoteData] = await Promise.all([priceRes.json(), quoteRes.json()]);
    if (quoteData.status === 'error' || !quoteData.close) return null;

    const livePrice  = priceData?.price ? parseFloat(priceData.price) : null;
    const closePrice = parseFloat(quoteData.close);

    return {
      price:      (livePrice ?? closePrice).toFixed(2),
      priceLabel: livePrice ? 'tiempo real' : 'cierre ant.',
      name:       quoteData.name ?? ticker,
      currency:   quoteData.currency ?? 'USD',
      changePct:  quoteData.percent_change ? parseFloat(quoteData.percent_change).toFixed(2) : '—',
      high52:     quoteData.fifty_two_week?.high ? parseFloat(quoteData.fifty_two_week.high).toFixed(2) : '—',
      low52:      quoteData.fifty_two_week?.low  ? parseFloat(quoteData.fifty_two_week.low).toFixed(2)  : '—',
      exchange:   quoteData.exchange ?? 'NASDAQ',
    };
  } catch { return null; }
}

// ── FMP: resolve ticker to correct symbol (handles ACS → ACS.MC, etc.) ───────
const PREFERRED_EXCHANGES = ['NASDAQ','NYSE','AMEX','BME','XETRA','LSE','EURONEXT','TSX','ASX','AMS','PAR','ETR','STO','HEL','CPH','OSL','IST'];
const SKIP_EXCHANGES = ['OTC','CRYPTO','MUTUAL_FUND','ETF','INDEX','PNK','GREY'];

async function resolveSymbol(ticker: string, fmpKey: string): Promise<string> {
  // Try exact match first (works for US tickers and already-suffixed ones like ACS.MC)
  const profileRes = await fetch(`${FMP_BASE}/profile?symbol=${encodeURIComponent(ticker)}&apikey=${fmpKey}`);
  const profileData = await profileRes.json().catch(() => []);
  if (Array.isArray(profileData) && profileData.length > 0 && profileData[0]?.companyName) {
    return ticker; // exact match found
  }

  // Search for alternatives
  const searchRes = await fetch(`${FMP_BASE}/search-symbol?query=${encodeURIComponent(ticker)}&apikey=${fmpKey}`);
  const results = await searchRes.json().catch(() => []);
  if (!Array.isArray(results) || results.length === 0) return ticker;

  // Filter: exact ticker match (case-insensitive, ignoring suffix) or starts with ticker
  const tickerUpper = ticker.toUpperCase();
  const candidates = results.filter((r: { symbol: string; exchange: string; name: string }) => {
    const sym = r.symbol.toUpperCase();
    const baseSymbol = sym.split('.')[0];
    if (SKIP_EXCHANGES.includes(r.exchange?.toUpperCase())) return false;
    return baseSymbol === tickerUpper;
  });

  if (candidates.length === 0) return ticker;

  // Sort by exchange preference
  candidates.sort((a: { symbol: string; exchange: string }, b: { symbol: string; exchange: string }) => {
    const aIdx = PREFERRED_EXCHANGES.indexOf(a.exchange?.toUpperCase() ?? '');
    const bIdx = PREFERRED_EXCHANGES.indexOf(b.exchange?.toUpperCase() ?? '');
    const aScore = aIdx === -1 ? 999 : aIdx;
    const bScore = bIdx === -1 ? 999 : bIdx;
    return aScore - bScore;
  });

  const resolved = candidates[0].symbol;
  console.log(`[generate-report] Resolved ${ticker} → ${resolved} (${candidates[0].exchange})`);
  return resolved;
}

// ── FMP: real fundamentals ────────────────────────────────────────────────────
interface FmpFundamentals {
  name: string;
  description: string;
  sector: string;
  industry: string;
  country: string;
  exchange: string;
  currency: string;
  mktCap: string;
  // Last 4 quarters income
  quarters: Array<{
    date: string;
    revenue: number;
    revenueYoY: string;
    netIncome: number;
    eps: number;
    epsYoY: string;
    grossMargin: string;
  }>;
  // Analyst estimates (next 2 quarters)
  estimates: Array<{
    date: string;
    revenueEst: number;
    epsEst: number;
  }>;
  // Key metrics
  peRatio: string;
  forwardPE: string;
  priceToSales: string;
  debtToEquity: string;
}

async function fetchFundamentals(ticker: string, fmpKey: string): Promise<FmpFundamentals | null> {
  try {
    // New stable API (post Aug 2025) — parallel requests
    const [profileRes, incomeRes, ratiosRes] = await Promise.all([
      fetch(`${FMP_BASE}/profile?symbol=${encodeURIComponent(ticker)}&apikey=${fmpKey}`),
      fetch(`${FMP_BASE}/income-statement?symbol=${encodeURIComponent(ticker)}&period=quarter&limit=5&apikey=${fmpKey}`),
      fetch(`${FMP_BASE}/ratios-ttm?symbol=${encodeURIComponent(ticker)}&apikey=${fmpKey}`),
    ]);

    const [profileData, incomeData, ratiosData] = await Promise.all([
      profileRes.json(), incomeRes.json(), ratiosRes.json(),
    ]);

    // Profile must exist and have real data
    if (!Array.isArray(profileData) || profileData.length === 0 || !profileData[0]?.companyName) {
      return null;
    }
    const p = profileData[0];

    // Income statements — not available for non-US stocks on free plan (graceful fallback)
    const hasIncome = Array.isArray(incomeData) && incomeData.length >= 1;

    // Build quarters (up to 4, with YoY vs same quarter prior year when available)
    const quarters = hasIncome ? incomeData.slice(0, 4).map((q: Record<string, number | string>, i: number) => {
      const prevYear = incomeData[i + 4]; // same quarter 1 year ago (may not exist in free plan)
      const revYoY = prevYear && prevYear.revenue
        ? (((q.revenue as number) - (prevYear.revenue as number)) / Math.abs(prevYear.revenue as number) * 100).toFixed(1) + '%'
        : '—';
      const epsYoY = prevYear && prevYear.eps != null
        ? (((q.eps as number) - (prevYear.eps as number)) / Math.abs(prevYear.eps as number) * 100).toFixed(1) + '%'
        : '—';
      const grossMargin = q.revenue && q.grossProfit
        ? (((q.grossProfit as number) / (q.revenue as number)) * 100).toFixed(1) + '%'
        : '—';
      return {
        date:        q.date as string,
        revenue:     q.revenue as number,
        revenueYoY:  revYoY,
        netIncome:   q.netIncome as number,
        eps:         q.eps as number,
        epsYoY,
        grossMargin,
      };
    }) : [];

    // Ratios TTM (available on free plan as single object)
    const ratios = Array.isArray(ratiosData) ? ratiosData[0] : ratiosData;

    // Format market cap from profile
    const mc = p.marketCap ?? p.mktCap ?? 0;
    const currency = p.currency ?? 'USD';
    const currSymbol = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
    const mktCap = mc > 1e12 ? `${currSymbol}${(mc / 1e12).toFixed(2)}T`
                : mc > 1e9  ? `${currSymbol}${(mc / 1e9).toFixed(1)}B`
                : mc > 1e6  ? `${currSymbol}${(mc / 1e6).toFixed(0)}M`
                : `${currSymbol}${mc}`;

    return {
      name:         p.companyName,
      description:  p.description ?? '',
      sector:       p.sector ?? '',
      industry:     p.industry ?? '',
      country:      p.country ?? '',
      exchange:     p.exchangeShortName ?? p.exchange ?? '',
      currency,
      mktCap,
      quarters,
      estimates:    [], // analyst-estimates quarterly not available on free plan
      peRatio:      p.pe != null ? Number(p.pe).toFixed(1) : (ratios?.peRatioTTM != null ? Number(ratios.peRatioTTM).toFixed(1) : '—'),
      forwardPE:    '—',
      priceToSales: ratios?.priceToSalesRatioTTM != null ? Number(ratios.priceToSalesRatioTTM).toFixed(2) : '—',
      debtToEquity: ratios?.debtEquityRatioTTM != null ? Number(ratios.debtEquityRatioTTM).toFixed(2) : '—',
    };
  } catch (e) {
    console.error('[generate-report] FMP error:', e);
    return null;
  }
}

// ── Format number helpers ─────────────────────────────────────────────────────
function fmtM(n: number): string {
  if (!n) return '—';
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
}

function yoyColor(val: string): string {
  if (val === '—') return '#64748b';
  return val.startsWith('-') ? '#ef4444' : '#10b981';
}

// ── Build prompt with real data ───────────────────────────────────────────────
function buildPrompt(
  ticker: string,
  quote: Awaited<ReturnType<typeof fetchQuote>>,
  fund: FmpFundamentals,
) {
  const today = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const exchange = fund.exchange || quote?.exchange || 'NASDAQ';

  // Quarters table text
  const hasQuarters = fund.quarters.length > 0;
  const quartersText = hasQuarters
    ? fund.quarters.map(q =>
        `  ${q.date}: Ingresos ${fmtM(q.revenue)} (${q.revenueYoY} YoY) | EPS ${q.eps?.toFixed(2) ?? '—'} (${q.epsYoY} YoY) | Margen bruto ${q.grossMargin}`
      ).join('\n')
    : '  Datos trimestrales detallados no disponibles para este mercado en el plan actual.';

  const estimatesText = fund.estimates.length > 0
    ? fund.estimates.map(e =>
        `  ${e.date}: Ingresos est. ${fmtM(e.revenueEst)} | EPS est. ${e.epsEst?.toFixed(2) ?? '—'}`
      ).join('\n')
    : '  Sin estimaciones disponibles';

  const priceBlock = quote
    ? `COTIZACIÓN (TwelveData — ${quote.priceLabel}):
- Precio: ${quote.price} ${quote.currency}
- Cambio día: ${quote.changePct}%
- Máx 52W: ${quote.high52} ${quote.currency}
- Mín 52W: ${quote.low52} ${quote.currency}
- Exchange: ${exchange}`
    : `COTIZACIÓN: No disponible`;

  const fundamentalsBlock = `DATOS FUNDAMENTALES REALES (Financial Modeling Prep — ${today}):
Empresa: ${fund.name}
Sector: ${fund.sector} · ${fund.industry}
País: ${fund.country}
Market Cap: ${fund.mktCap}
PER: ${fund.peRatio} | P/S: ${fund.priceToSales} | Deuda/Equity: ${fund.debtToEquity}
Moneda: ${fund.currency}

ÚLTIMOS 4 TRIMESTRES (datos reales):
${quartersText}

ESTIMACIONES ANALISTAS (próximos trimestres):
${estimatesText}

DESCRIPCIÓN OFICIAL:
${fund.description.slice(0, 600)}`;

  return `Eres un analista bursátil experto. Genera un informe completo en HTML autocontenido para: **${ticker} — ${fund.name}**.

${priceBlock}

${fundamentalsBlock}

INSTRUCCIONES CRÍTICAS:
- USA ÚNICAMENTE los datos numéricos proporcionados arriba. NO inventes cifras.
- Para el análisis narrativo (competidores, sector, posición) usa tu conocimiento.
- Fecha del informe: ${today}
- Si un dato dice "—" ponlo como "n/d" en el informe.

━━━ ESTRUCTURA HTML REQUERIDA (secciones A→H en este orden exacto) ━━━

A) HERO superior (fondo oscuro con color corporativo):
- Caja blanca (≈110px, border-radius 16px) con logo SVG INLINE — dibuja el logo con colores de marca (NUNCA uses URLs externas)
- Nombre completo <h1> Georgia 44px + badge con ticker + exchange
- Subtítulo "Análisis fundamental y técnico · ${today}"
- Strip de 5 stat-cards: Cotización (${quote?.price ?? '—'} ${quote?.currency ?? ''}), Market Cap (${fund.mktCap}), Ingresos último trim YoY (${fund.quarters[0]?.revenueYoY ?? '—'}), EPS último trim YoY (${fund.quarters[0]?.epsYoY ?? '—'}), Distancia ATH

B) "¿A qué se dedica?" — tarjeta blanca 3-5 líneas, términos clave en color acento. Basa en la descripción oficial.

C) "Posición competitiva":
- Izquierda: 4 tarjetas con borde-izquierdo 6px (sub-sector: ${fund.industry}, posición mercado, rival principal, cuota estimada)
- Derecha: bloque oscuro "Rival principal" con nombre y bullets

D) "Potencial futuro del sector": 3 tarjetas con borde-top 4px. Bloque oscuro "Riesgos a vigilar"

E) "Datos fundamentales" — USA EXACTAMENTE ESTOS NÚMEROS:
- Tarjeta grande: Market Cap ${fund.mktCap} | PER ${fund.peRatio} | P/S ${fund.priceToSales}
- Tabla izquierda "Resultados trimestrales": ${hasQuarters ? `con los ${fund.quarters.length} trimestres reales de arriba (fecha, ingresos, EPS, margen, YoY en verde/rojo)` : `muestra un aviso "Datos trimestrales no disponibles para este mercado" con fondo gris claro y texto explicativo`}
- Tabla derecha "Estimaciones analistas" con los datos de arriba
- Pie de tabla: "Fuente: Financial Modeling Prep · ${today}"

F) "Análisis técnico — Distancia a máximos":
- Calcula distancia ATH usando precio ${quote?.price ?? '—'} y máx 52W ${quote?.high52 ?? '—'}
- Bloque oscuro izquierda: porcentaje Georgia 96px + precio actual + máx 52W
- Tarjeta blanca derecha: lectura técnica con soportes y resistencias

G) "Gráfico de cotización" — usa EXACTAMENTE este bloque HTML sin modificarlo:
<div id="tv-container" style="position:relative;width:100%;height:560px;background:#f8fafc;border-radius:12px;overflow:hidden;">
  <iframe id="tv-frame" src="https://s.tradingview.com/widgetembed/?symbol=${exchange}%3A${ticker}&interval=W&theme=light&style=1&locale=es&toolbarbg=F1F3F6&hideideas=1&range=24M&hidetoptoolbar=0&hidesidetoolbar=1&saveimage=0&studies=%5B%5D" style="width:100%;height:100%;border:none;" allowtransparency="true" allowfullscreen="" onerror="document.getElementById('tv-fallback').style.display='flex';this.style.display='none'"></iframe>
  <div id="tv-fallback" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;flex-direction:column;gap:12px;background:#f8fafc;color:#64748b;font-family:system-ui">
    <div style="font-size:48px">📊</div>
    <div style="font-weight:700;font-size:16px">Gráfico no disponible en TradingView</div>
    <a href="https://finance.yahoo.com/quote/${ticker}/chart" target="_blank" style="margin-top:8px;padding:10px 20px;background:var(--accent);color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px">Ver en Yahoo Finance →</a>
  </div>
</div>

H) Footer: "Informe generado el ${today}" · Fuentes: Financial Modeling Prep, TwelveData, TradingView · Disclaimer legal

━━━ PALETA Y DISEÑO ━━━
- Colores REALES de marca de la empresa
- Define: --navy, --accent, --light (#F7F7F7)
- Georgia para títulos, system-ui para cuerpo
- CSS en <style> en el <head>, layout responsivo

━━━ REQUISITOS TÉCNICOS ━━━
- HTML AUTOCONTENIDO sin librerías externas salvo el iframe TradingView
- Logo SVG inline obligatorio
- DEVUELVE ÚNICAMENTE EL HTML. Sin markdown. El primer carácter debe ser < y el último >.`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return jsonResponse({ error: 'unauthorized' }, 401);

  const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  const tdKey        = Deno.env.get('TWELVEDATA_API_KEY');
  const fmpKey       = Deno.env.get('FMP_API_KEY');

  if (!anthropicKey) return jsonResponse({ error: 'ANTHROPIC_API_KEY not configured' }, 503);

  const token = authHeader.slice(7);
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return jsonResponse({ error: 'unauthorized' }, 401);

  const { ticker } = await req.json().catch(() => ({})) as { ticker?: string };
  if (!ticker?.trim()) return jsonResponse({ error: 'ticker required' }, 400);

  const rawSym = ticker.trim().toUpperCase();

  // ── Resolve ticker (e.g. ACS → ACS.MC, ITX → ITX.MC) ────────────────────
  const sym = fmpKey ? await resolveSymbol(rawSym, fmpKey) : rawSym;

  // ── Fetch all data in parallel ────────────────────────────────────────────
  const [quote, fund] = await Promise.all([
    tdKey  ? fetchQuote(sym, tdKey)           : Promise.resolve(null),
    fmpKey ? fetchFundamentals(sym, fmpKey)   : Promise.resolve(null),
  ]);

  // ── Block if no real fundamentals ─────────────────────────────────────────
  if (!fund) {
    console.log(`[generate-report] No FMP data for ${sym} — blocking report`);
    return jsonResponse({
      error: 'no_fundamentals',
      message: `No hay datos fundamentales disponibles para <b>${sym}</b>.<br>El Informe Fundamental está disponible para empresas cotizadas en <b>NASDAQ, NYSE y AMEX</b>. Prueba con AAPL, NVDA, MSFT, AMZN o GOOGL.`,
    }, 422);
  }

  // ── Block non-US exchanges (FMP free only covers US fully) ────────────────
  const US_EXCHANGES = ['NASDAQ','NYSE','AMEX','NYSE ARCA','BATS','CBOE','NYSEARCA','NYSE MKT'];
  const fundExchange = (fund.exchange ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
  const isUS = US_EXCHANGES.some(ex => fundExchange === ex || fundExchange.startsWith(ex));
  if (!isUS) {
    console.log(`[generate-report] Non-US exchange blocked: ${sym} (${fund.exchange})`);
    return jsonResponse({
      error: 'us_only',
      message: `El Informe Fundamental solo está disponible para empresas de <b>NASDAQ, NYSE y AMEX</b>.<br><b>${fund.name}</b> cotiza en ${fund.exchange}. Próximamente ampliaremos cobertura a mercados europeos.`,
    }, 422);
  }

  // ── Generate HTML with Claude ─────────────────────────────────────────────
  const prompt = buildPrompt(sym, quote, fund);

  const antRes = await fetch(ANT_API, {
    method: 'POST',
    headers: {
      'x-api-key':         anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!antRes.ok) {
    const err = await antRes.text();
    console.error('[generate-report] Anthropic error:', err);
    return jsonResponse({ error: `Anthropic API error: ${antRes.status}` }, 502);
  }

  const antData = await antRes.json();
  const htmlBlock = antData.content?.find((b: { type: string }) => b.type === 'text');
  const html: string = htmlBlock?.text ?? '';

  if (!html.trim().startsWith('<')) {
    console.error('[generate-report] unexpected response:', html.slice(0, 200));
    return jsonResponse({ error: 'Unexpected response format from AI' }, 502);
  }

  return jsonResponse({ html, ticker: sym, name: fund.name ?? sym });
});
