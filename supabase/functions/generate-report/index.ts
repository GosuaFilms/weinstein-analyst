// POST /functions/v1/generate-report
// Body: { ticker: string }
// Returns: { html: string, ticker, name } or { error: string }
//
// Strategy: Claude (tool use) + Tavily web search → real, current data from the web
//           TwelveData → reliable real-time price overlay
//
// Claude searches for: latest earnings, analyst estimates, ATH, competitive position.
// No FMP dependency. Works for US and international stocks.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const TD_BASE    = 'https://api.twelvedata.com';
const ANT_API    = 'https://api.anthropic.com/v1/messages';
const TAVILY_API = 'https://api.tavily.com/search';
const MODEL      = 'claude-sonnet-4-6';
const MAX_TOKENS = 14000;
const MAX_ITER   = 10; // max tool-use iterations

// ── TwelveData: live price + 52W range ───────────────────────────────────────
async function fetchLivePrice(ticker: string, tdKey: string) {
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

// ── Tavily search ─────────────────────────────────────────────────────────────
async function tavilySearch(query: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch(TAVILY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key:        apiKey,
        query,
        search_depth:   'advanced',
        include_answer: true,
        max_results:    5,
      }),
    });
    const data = await res.json();
    if (!res.ok) return `Search failed: ${data.message ?? res.status}`;

    let out = '';
    if (data.answer) out += `Respuesta directa: ${data.answer}\n\n`;
    if (data.results?.length) {
      out += data.results.slice(0, 5)
        .map((r: { title: string; url: string; content: string }) =>
          `Fuente: ${r.title}\nURL: ${r.url}\n${(r.content ?? '').slice(0, 600)}`)
        .join('\n\n---\n\n');
    }
    return out.trim() || 'Sin resultados.';
  } catch (e) {
    return `Error en búsqueda: ${(e as Error).message}`;
  }
}

// ── Build initial prompt ──────────────────────────────────────────────────────
function buildInitialPrompt(ticker: string, quote: ReturnType<typeof fetchLivePrice> extends Promise<infer T> ? T : never) {
  const today = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const priceContext = quote
    ? `Precio actual (TwelveData, ${quote.priceLabel}): ${quote.price} ${quote.currency} | Cambio día: ${quote.changePct}% | Máx 52W: ${quote.high52} | Mín 52W: ${quote.low52} | Exchange: ${quote.exchange}`
    : 'Precio: buscar en web';

  return `Actúa como analista bursátil experto. Genera un informe HTML completo para el ticker **${ticker}**.

DATOS DE PRECIO YA DISPONIBLES (TwelveData — ${today}):
${priceContext}

INSTRUCCIONES DE BÚSQUEDA:
Usa la herramienta web_search para buscar estos datos REALES y ACTUALES (mínimo 4 búsquedas):

1. "${ticker} earnings results latest quarter 2025 2026 revenue EPS YoY" → último trimestre reportado
2. "${ticker} analyst estimates consensus next quarter revenue EPS 2026" → previsiones analistas
3. "${ticker} all time high stock price close ATH history" → máximo histórico de cierre
4. "${ticker} competitors market share sector position 2025 2026" → posición competitiva
5. "${ticker} company business description segments 2026" → descripción actualizada (si necesitas)

Hoy es: ${today}. Busca primero, luego genera el HTML.

━━━ FORMATO HTML REQUERIDO (secciones A→H en este orden exacto) ━━━

A) HERO superior (fondo oscuro con color corporativo de la empresa):
- Barra lateral izquierda (~14px) en color de acento
- Caja blanca (≈110px, border-radius 16px) con logo SVG INLINE — dibuja el logo con colores de marca (NUNCA uses URLs externas ni Clearbit)
- Nombre completo <h1> Georgia 44px + badge con ticker + exchange
- Subtítulo "Análisis fundamental y técnico · ${today}"
- Strip de 5 stat-cards: Cotización, Market Cap, Ventas Q-último YoY, EPS Q-último YoY, Distancia ATH

B) "¿A qué se dedica?" — tarjeta blanca 3-5 líneas, términos clave en color acento.

C) "Posición competitiva":
- Columna izquierda: 4 tarjetas con borde-izquierdo 6px (sub-sectores, posición #1/#2, cuota %, nota sobre competidor)
- Columna derecha: bloque oscuro "Rival principal" con nombre, eslogan "La mayor amenaza estructural" y bullets

D) "Potencial futuro del sector": 3 tarjetas con borde-top 4px y icono unicode (▲ ● ■). Bloque oscuro "Riesgos a vigilar" en línea con riesgos separados por " · "

E) "Datos fundamentales":
- Tarjeta horizontal: Market Cap grande + métricas resumen (PER, P/S, Deuda/Equity si tienes)
- Dos tablas lado a lado:
  · Izquierda "Q{último} {año} · Último trimestre reportado" (cabecera oscura): Ventas, YoY, EPS, YoY, Margen bruto, segmentos clave
  · Derecha "Q{próximo} {año} · Previsión analistas (reporta {fecha})" (cabecera en acento): consenso Ventas, EPS, guidance
- YoY en verde si positivo, rojo si negativo
- Pie: "Fuente: búsqueda web · ${today}"

F) "Análisis técnico — Distancia a máximos históricos":
- Bloque oscuro izquierda: % distancia ATH en Georgia 96px + precio actual + ATH cierre con fecha + máx 52W
- Tarjeta blanca derecha: lectura técnica con soportes, resistencias, próximo catalizador

G) "Gráfico de cotización" — usa EXACTAMENTE este HTML sin modificarlo:
<div id="tv-container" style="position:relative;width:100%;height:560px;background:#f8fafc;border-radius:12px;overflow:hidden;">
  <iframe id="tv-frame" src="https://s.tradingview.com/widgetembed/?symbol=${quote?.exchange ?? 'NASDAQ'}%3A${ticker}&interval=W&theme=light&style=1&locale=es&toolbarbg=F1F3F6&hideideas=1&range=24M&hidetoptoolbar=0&hidesidetoolbar=1&saveimage=0&studies=%5B%5D" style="width:100%;height:100%;border:none;" allowtransparency="true" allowfullscreen="" onerror="document.getElementById('tv-fallback').style.display='flex';this.style.display='none'"></iframe>
  <div id="tv-fallback" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;flex-direction:column;gap:12px;background:#f8fafc;color:#64748b;font-family:system-ui">
    <div style="font-size:48px">📊</div>
    <div style="font-weight:700;font-size:16px">Gráfico no disponible</div>
    <a href="https://finance.yahoo.com/quote/${ticker}/chart" target="_blank" style="margin-top:8px;padding:10px 20px;background:var(--accent);color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px">Ver en Yahoo Finance →</a>
  </div>
</div>

H) Footer: fecha "${today}" · fuentes consultadas con URLs reales de las búsquedas · disclaimer legal

━━━ PALETA Y DISEÑO ━━━
- Colores REALES de marca de la empresa (ej: Apple navy=#1D1D1F accent=#0071E3, NVIDIA navy=#1a1a2e accent=#76b900, Amazon navy=#232F3E accent=#FF9900)
- Define --navy, --accent, --light (#F7F7F7)
- Georgia para títulos, system-ui para cuerpo, 14-15px body
- CSS en <style> en el <head>, layout responsivo

━━━ REQUISITOS TÉCNICOS ━━━
- HTML AUTOCONTENIDO sin librerías externas salvo el iframe TradingView
- Logo SVG inline obligatorio — NUNCA dependas de URLs externas
- USA SOLO datos reales encontrados en las búsquedas — NO inventes cifras
- Si un dato no lo encuentras, ponlo como "n/d" en el informe
- DEVUELVE ÚNICAMENTE EL HTML. Sin markdown. El primer carácter debe ser < y el último >.`;
}

// ── Claude tool-use agentic loop ──────────────────────────────────────────────
const WEB_SEARCH_TOOL = {
  name: 'web_search',
  description: 'Busca información actual en la web sobre empresas cotizadas: resultados trimestrales, estimaciones de analistas, precio, ATH histórico, posición competitiva y sector.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Consulta de búsqueda específica. Incluye el ticker/empresa y el dato concreto que buscas.',
      },
    },
    required: ['query'],
  },
};

async function runAgenticLoop(
  initialPrompt: string,
  anthropicKey: string,
  tavilyKey: string,
): Promise<string> {
  type Message = { role: 'user' | 'assistant'; content: string | unknown[] };
  const messages: Message[] = [
    { role: 'user', content: initialPrompt },
  ];

  for (let i = 0; i < MAX_ITER; i++) {
    const res = await fetch(ANT_API, {
      method: 'POST',
      headers: {
        'x-api-key':         anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        tools:      [WEB_SEARCH_TOOL],
        messages,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json();
    const content = data.content ?? [];

    // Add assistant turn
    messages.push({ role: 'assistant', content });

    if (data.stop_reason === 'end_turn') {
      // Extract HTML from text block
      const textBlock = content.find((b: { type: string }) => b.type === 'text');
      const html: string = textBlock?.text ?? '';
      if (!html.trim().startsWith('<')) {
        throw new Error('El modelo no generó HTML válido');
      }
      return html;
    }

    if (data.stop_reason === 'tool_use') {
      // Execute all tool calls in parallel
      const toolUseBlocks = content.filter((b: { type: string }) => b.type === 'tool_use');

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block: { id: string; name: string; input: { query: string } }) => {
          console.log(`[generate-report] Searching: ${block.input.query}`);
          const result = await tavilySearch(block.input.query, tavilyKey);
          return {
            type:        'tool_result',
            tool_use_id: block.id,
            content:     result,
          };
        })
      );

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Unexpected stop reason
    throw new Error(`Unexpected stop_reason: ${data.stop_reason}`);
  }

  throw new Error('Se alcanzó el límite de iteraciones sin generar el informe');
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
  const tavilyKey    = Deno.env.get('TAVILY_API_KEY');
  const tdKey        = Deno.env.get('TWELVEDATA_API_KEY');

  if (!anthropicKey) return jsonResponse({ error: 'ANTHROPIC_API_KEY not configured' }, 503);
  if (!tavilyKey)    return jsonResponse({ error: 'TAVILY_API_KEY not configured' }, 503);

  const token = authHeader.slice(7);
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return jsonResponse({ error: 'unauthorized' }, 401);

  const { ticker } = await req.json().catch(() => ({})) as { ticker?: string };
  if (!ticker?.trim()) return jsonResponse({ error: 'ticker required' }, 400);

  const sym = ticker.trim().toUpperCase();

  // ── Fetch live price (best effort, non-blocking) ──────────────────────────
  const quote = tdKey ? await fetchLivePrice(sym, tdKey).catch(() => null) : null;

  // ── Build prompt + run agentic loop ──────────────────────────────────────
  try {
    const prompt = buildInitialPrompt(sym, quote as Parameters<typeof buildInitialPrompt>[1]);
    const html   = await runAgenticLoop(prompt, anthropicKey, tavilyKey);

    const companyName = quote?.name ?? sym;
    return jsonResponse({ html, ticker: sym, name: companyName });

  } catch (e) {
    const msg = (e as Error).message ?? 'Error desconocido';
    console.error('[generate-report] Error:', msg);

    // User-facing errors
    if (msg.includes('no_fundamentals') || msg.includes('not found')) {
      return jsonResponse({
        error:   'no_fundamentals',
        message: `No se encontraron datos para <b>${sym}</b>. Verifica que el ticker sea correcto.`,
      }, 422);
    }

    return jsonResponse({ error: msg }, 500);
  }
});
