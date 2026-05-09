// POST /functions/v1/generate-report
// Body: { ticker: string }
// Returns: { html: string }
// Generates a full fundamental + technical HTML report via Claude claude-opus-4-7.
// Enriches the prompt with live TwelveData quote before calling Claude.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const TD_BASE   = 'https://api.twelvedata.com';
const ANT_API   = 'https://api.anthropic.com/v1/messages';
const MODEL     = 'claude-sonnet-4-6'; // Sonnet 4.6: same HTML quality as Opus, 42% cheaper
const MAX_TOKENS = 10000;

// ── Fetch live quote from TwelveData ─────────────────────────────────────────
async function fetchQuote(ticker: string, tdKey: string) {
  try {
    const res  = await fetch(`${TD_BASE}/quote?symbol=${encodeURIComponent(ticker)}&apikey=${tdKey}`);
    const data = await res.json();
    if (data.status === 'error' || !data.close) return null;
    return {
      price:    parseFloat(data.close).toFixed(2),
      name:     data.name ?? ticker,
      currency: data.currency ?? 'USD',
      change:   data.percent_change ? `${parseFloat(data.percent_change).toFixed(2)}%` : '—',
      high52:   data.fifty_two_week?.high  ? parseFloat(data.fifty_two_week.high).toFixed(2)  : '—',
      low52:    data.fifty_two_week?.low   ? parseFloat(data.fifty_two_week.low).toFixed(2)   : '—',
      exchange: data.exchange ?? 'NASDAQ',
    };
  } catch {
    return null;
  }
}

// ── Build the system prompt ──────────────────────────────────────────────────
function buildPrompt(ticker: string, quote: ReturnType<typeof fetchQuote> extends Promise<infer T> ? T : never) {
  const today = new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const priceBlock = quote
    ? `DATOS EN TIEMPO REAL (TwelveData):
- Nombre: ${quote!.name}
- Precio actual: ${quote!.price} ${quote!.currency}
- Cambio día: ${quote!.change}
- Máximo 52 semanas: ${quote!.high52} ${quote!.currency}
- Mínimo 52 semanas: ${quote!.low52} ${quote!.currency}
- Exchange: ${quote!.exchange}`
    : `No se ha podido obtener cotización en tiempo real. Usa tu conocimiento de entrenamiento para el precio.`;

  return `Eres un analista bursátil experto. Genera un informe completo en HTML autocontenido para el ticker: **${ticker}**.

${priceBlock}

DATOS FUNDAMENTALES: Usa tu conocimiento hasta tu fecha de entrenamiento (resultados trimestrales, guidance, competidores, sector).

━━━ ESTRUCTURA HTML REQUERIDA (secciones A→H en este orden exacto) ━━━

A) HERO superior (fondo oscuro con color corporativo):
- Caja blanca (≈110px, border-radius 16px) con logo SVG INLINE — dibuja el logo con colores de marca (NUNCA uses Clearbit ni URLs externas)
- Nombre completo <h1> Georgia 44px + badge con ticker
- Subtítulo "Análisis fundamental y técnico · ${today}"
- Strip de 5 stat-cards: Cotización, Market Cap, Ventas Q-último YoY, EPS Q-último YoY, Distancia ATH

B) "¿A qué se dedica?" — tarjeta blanca 3-5 líneas, términos clave en color acento

C) "Posición competitiva":
- Izquierda: 4 tarjetas con borde-izquierdo 6px (sub-sector, posición, cuota %, rival)
- Derecha: bloque oscuro "Rival principal" con nombre y bullets explicando amenaza

D) "Potencial futuro del sector": 3 tarjetas con borde-top 4px (icono unicode ▲●■ + título + párrafo). Bloque oscuro "Riesgos a vigilar" con riesgos separados por " · "

E) "Datos fundamentales":
- Tarjeta Market Cap grande
- Dos tablas: izquierda "Último trimestre" (cabecera oscura), derecha "Próximo trimestre — Previsión" (cabecera en acento). Columnas YoY en verde si positivo

F) "Análisis técnico — Distancia a máximos":
- Bloque oscuro izquierda: "≈ X%" en Georgia 96px + cierre actual + ATH + máx 52W
- Tarjeta blanca derecha: bullets lectura técnica (recuperación, soportes, resistencias, catalizador)

G) "Gráfico de cotización" — iframe TradingView (height 560px, width 100%):
URL exacta: https://s.tradingview.com/widgetembed/?symbol=${quote?.exchange ?? 'NASDAQ'}%3A${ticker}&interval=W&theme=light&style=1&locale=es&toolbarbg=F1F3F6&hideideas=1&range=24M&hidetoptoolbar=0&hidesidetoolbar=1&saveimage=0&studies=%5B%5D

H) Footer con fecha "${today}" y fuentes (Yahoo Finance, TwelveData, informes trimestrales de la empresa, consenso de analistas)

━━━ PALETA Y DISEÑO ━━━
- Usa los colores REALES de marca de la empresa (ej: Amazon navy=#232F3E accent=#FF9900, Apple navy=#1D1D1F accent=#0071E3, Microsoft navy=#243A5E accent=#0078D4, NVIDIA navy=#1A1A2E accent=#76B900, Meta navy=#0866FF accent=#1877F2, Tesla navy=#CC0000 accent=#E82127, Google navy=#202124 accent=#4285F4)
- Define: --navy (oscuro), --accent (color de marca), --light (#F7F7F7)
- Tipografía: Georgia para títulos, system-ui/Segoe UI para cuerpo
- Todo el CSS en <style> en el <head>
- Layout responsivo con media query a 640px
- Fondo general: --light

━━━ REQUISITOS TÉCNICOS ━━━
- HTML AUTOCONTENIDO: sin librerías externas salvo el iframe TradingView
- Logo SVG inline obligatorio (si no conoces bien el logo, haz versión tipográfica con iniciales y colores de marca en caja redondeada)
- DEVUELVE ÚNICAMENTE EL HTML. Sin markdown, sin explicaciones, sin bloques de código. El primer carácter debe ser < y el último >.`;
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // Auth
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return jsonResponse({ error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  const tdKey       = Deno.env.get('TWELVEDATA_API_KEY');

  if (!anthropicKey) return jsonResponse({ error: 'ANTHROPIC_API_KEY not configured' }, 503);

  const token = authHeader.slice(7);
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return jsonResponse({ error: 'unauthorized' }, 401);

  // Parse body
  const { ticker } = await req.json().catch(() => ({})) as { ticker?: string };
  if (!ticker?.trim()) return jsonResponse({ error: 'ticker required' }, 400);

  const sym = ticker.trim().toUpperCase();

  // Fetch live quote (best-effort)
  const quote = tdKey ? await fetchQuote(sym, tdKey) : null;

  // Call Claude claude-opus-4-7
  const prompt = buildPrompt(sym, quote);

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
      messages: [
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!antRes.ok) {
    const err = await antRes.text();
    console.error('[generate-report] Anthropic error:', err);
    return jsonResponse({ error: `Anthropic API error: ${antRes.status}` }, 502);
  }

  const antData = await antRes.json();

  // Extract HTML from response (skip thinking blocks)
  const htmlBlock = antData.content?.find((b: { type: string }) => b.type === 'text');
  const html: string = htmlBlock?.text ?? '';

  if (!html.trim().startsWith('<')) {
    console.error('[generate-report] unexpected response:', html.slice(0, 200));
    return jsonResponse({ error: 'Unexpected response format from AI' }, 502);
  }

  return jsonResponse({ html, ticker: sym, name: quote?.name ?? sym });
});
