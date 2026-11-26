// GET /valor/<slug> (rewritten here by vercel.json).
// Serves the SPA's index.html with the stock's own <title>, description,
// canonical and social tags, plus a plain-text summary inside #root, so search
// engines and link previews (WhatsApp, X, Telegram) see the page without running
// JavaScript. React replaces the summary when the app loads.
// Any failure falls back to the untouched index.html: the page still works.

const SITE = 'https://www.alphastage.finance';
const STAGE: Record<string, [string, string]> = {
  STAGE_1: ['Etapa 1', 'base'], STAGE_2: ['Etapa 2', 'tendencia alcista'],
  STAGE_3: ['Etapa 3', 'techo'], STAGE_4: ['Etapa 4', 'tendencia bajista'],
};
const TREND: Record<string, string> = { rising: 'ascendente', falling: 'descendente', flat: 'plana' };

interface Row {
  symbol: string; slug: string; name: string | null; stage: string; scan_date: string;
  price: number | null; currency: string | null; distance_pct: number | null; rs: number | null; sma30_trend: string | null;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const signed = (v: number | null, suffix = '') => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}${suffix}`);
const date = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

let shell: { html: string; at: number } | null = null;

async function indexHtml(origin: string): Promise<string> {
  if (shell && Date.now() - shell.at < 10 * 60_000) return shell.html;
  const res = await fetch(`${origin}/index.html`);
  if (!res.ok) throw new Error(`index.html ${res.status}`);
  shell = { html: await res.text(), at: Date.now() };
  return shell.html;
}

async function loadRow(slug: string): Promise<Row | null> {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('missing Supabase env');
  const res = await fetch(
    `${url}/rest/v1/stock_pages?slug=eq.${encodeURIComponent(slug)}&select=symbol,slug,name,stage,scan_date,price,currency,distance_pct,rs,sma30_trend&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) throw new Error(`stock_pages ${res.status}`);
  const rows = (await res.json()) as Row[];
  return rows[0] ?? null;
}

/** Replaces the content attribute of the first tag matching `pattern`. */
function setContent(html: string, pattern: RegExp, value: string): string {
  return html.replace(pattern, (tag) => tag.replace(/(content|href)="[^"]*"/, `$1="${esc(value)}"`));
}

export function render(html: string, r: Row): string {
  const [stageName, stageWord] = STAGE[r.stage] ?? [r.stage, ''];
  const name = r.name ?? r.symbol;
  const title = `${name} (${r.symbol}): ${stageName} de Weinstein — Alpha Stage`;
  const desc = `${name} está en ${stageName} (${stageWord}) según el método Weinstein: precio ${signed(r.distance_pct, ' %')} frente a su MM30 semanal ${TREND[r.sma30_trend ?? ''] ?? ''}, fuerza relativa de Mansfield ${signed(r.rs)}. Actualizado el ${date(r.scan_date)}.`;
  const url = `${SITE}/valor/${r.slug}`;

  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  out = setContent(out, /<meta name="description"[^>]*>/, desc);
  out = setContent(out, /<link rel="canonical"[^>]*>/, url);
  out = setContent(out, /<meta property="og:url"[^>]*>/, url);
  out = setContent(out, /<meta property="og:title"[^>]*>/, title);
  out = setContent(out, /<meta property="og:description"[^>]*>/, desc);
  out = setContent(out, /<meta name="twitter:url"[^>]*>/, url);
  out = setContent(out, /<meta name="twitter:title"[^>]*>/, title);
  out = setContent(out, /<meta name="twitter:description"[^>]*>/, desc);
  out = out.replace(/<meta property="og:type"[^>]*>/, '<meta property="og:type" content="article" />');

  const summary =
    `<div style="max-width:880px;margin:0 auto;padding:96px 24px;font-family:system-ui,sans-serif;color:#334155">` +
    `<h1>${esc(name)} (${esc(r.symbol)}): ${esc(stageName)} de Weinstein</h1>` +
    `<p>${esc(desc)}</p>` +
    `<p><a href="/valores">Etapa de Weinstein de todos los valores</a> · <a href="/etapa-2">Acciones en Etapa 2 hoy</a></p></div>`;
  return out.replace('<div id="root"></div>', `<div id="root">${summary}</div>`);
}

export async function GET(request: Request): Promise<Response> {
  const reqUrl = new URL(request.url);
  const origin = `${reqUrl.protocol}//${reqUrl.host}`;
  const slug = (reqUrl.searchParams.get('slug') ?? '').toLowerCase();
  const headers = { 'Content-Type': 'text/html; charset=utf-8' };

  let html: string;
  try {
    html = await indexHtml(origin);
  } catch {
    return Response.redirect(`${origin}/valores`, 302);
  }
  if (!/^[a-z0-9-]{1,30}$/.test(slug)) return new Response(html, { status: 404, headers });

  try {
    const row = await loadRow(slug);
    if (!row) return new Response(html, { status: 404, headers: { ...headers, 'Cache-Control': 'public, s-maxage=600' } });
    return new Response(render(html, row), {
      status: 200,
      headers: { ...headers, 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (e) {
    console.error('[stock-page]', (e as Error).message);
    return new Response(html, { status: 200, headers });
  }
}
