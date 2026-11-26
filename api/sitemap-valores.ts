// GET /sitemap-valores.xml (rewritten here by vercel.json): /valores and every
// public stock page /valor/<slug>, from the latest daily scan (table stock_pages).

const SITE = 'https://www.alphastage.finance';

export async function GET(): Promise<Response> {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return new Response('missing configuration', { status: 503 });

  const res = await fetch(`${url}/rest/v1/stock_pages?select=slug,scan_date&order=slug`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return new Response('unavailable', { status: 503 });
  const rows = (await res.json()) as { slug: string; scan_date: string }[];
  const latest = rows.reduce((m, r) => (r.scan_date > m ? r.scan_date : m), '');

  const entry = (path: string, lastmod: string, priority: string) =>
    `  <url><loc>${SITE}${path}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>daily</changefreq><priority>${priority}</priority></url>`;
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entry('/valores', latest, '0.8'),
    ...rows.map((r) => entry(`/valor/${r.slug}`, r.scan_date, '0.6')),
    '</urlset>',
  ].join('\n');

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
