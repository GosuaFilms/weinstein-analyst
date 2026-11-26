// GET /a/<id> (rewritten here by vercel.json): a shared analysis.
// Serves index.html with the analysis' own title, description and preview image
// (share-cards/<id>.png in Supabase Storage) so WhatsApp, X and Telegram show a
// rich preview. Shared analyses are not meant for search engines: noindex.
// Any failure falls back to the untouched index.html.

interface Row { id: string; ticker: string | null; company_name: string | null; has_card: boolean; created_at: string; payload: { stage?: string; verdict?: string } }

const SITE = 'https://www.alphastage.finance';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let shell: { html: string; at: number } | null = null;
async function indexHtml(origin: string): Promise<string> {
  if (shell && Date.now() - shell.at < 10 * 60_000) return shell.html;
  const res = await fetch(`${origin}/index.html`);
  if (!res.ok) throw new Error(`index.html ${res.status}`);
  shell = { html: await res.text(), at: Date.now() };
  return shell.html;
}

function setContent(html: string, pattern: RegExp, value: string): string {
  return html.replace(pattern, (tag) => tag.replace(/(content|href)="[^"]*"/, `$1="${esc(value)}"`));
}

export function render(html: string, r: Row, supabaseUrl: string): string {
  const name = r.company_name ?? r.ticker ?? 'Análisis';
  const date = new Date(r.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' });
  const title = `${r.ticker ?? name}: ${r.payload.stage ?? 'análisis'} · ${r.payload.verdict ?? ''} — análisis Weinstein`.replace(/ · {2}/, ' ');
  const desc = `Análisis de ${name} con el método de Stan Weinstein (${date}). Analiza tú cualquier valor gratis en Alpha Stage.`;
  const url = `${SITE}/a/${r.id}`;

  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  out = out.replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex, follow" />');
  out = setContent(out, /<meta name="description"[^>]*>/, desc);
  out = setContent(out, /<link rel="canonical"[^>]*>/, url);
  for (const [pattern, value] of [
    [/<meta property="og:url"[^>]*>/, url], [/<meta property="og:title"[^>]*>/, title], [/<meta property="og:description"[^>]*>/, desc],
    [/<meta name="twitter:url"[^>]*>/, url], [/<meta name="twitter:title"[^>]*>/, title], [/<meta name="twitter:description"[^>]*>/, desc],
  ] as const) out = setContent(out, pattern, value);
  if (r.has_card) {
    const img = `${supabaseUrl}/storage/v1/object/public/share-cards/${r.id}.png`;
    out = setContent(out, /<meta property="og:image" [^>]*>/, img);
    out = setContent(out, /<meta name="twitter:image"[^>]*>/, img);
  }
  return out;
}

export async function GET(request: Request): Promise<Response> {
  const reqUrl = new URL(request.url);
  const origin = `${reqUrl.protocol}//${reqUrl.host}`;
  const id = reqUrl.searchParams.get('id') ?? '';
  const headers = { 'Content-Type': 'text/html; charset=utf-8' };

  let html: string;
  try {
    html = await indexHtml(origin);
  } catch {
    return Response.redirect(`${origin}/`, 302);
  }
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!/^[a-z2-9]{10}$/.test(id) || !supabaseUrl || !key) return new Response(html, { status: 200, headers });

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/shared_analyses?id=eq.${id}&select=id,ticker,company_name,has_card,created_at,payload->stage,payload->verdict&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) throw new Error(`shared_analyses ${res.status}`);
    const rows = (await res.json()) as Array<Omit<Row, 'payload'> & { stage?: string; verdict?: string }>;
    const r = rows[0];
    if (!r) return new Response(html, { status: 404, headers });
    const row: Row = { ...r, payload: { stage: r.stage, verdict: r.verdict } };
    return new Response(render(html, row, supabaseUrl), {
      status: 200,
      headers: { ...headers, 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
    });
  } catch (e) {
    console.error('[shared-analysis]', (e as Error).message);
    return new Response(html, { status: 200, headers });
  }
}
