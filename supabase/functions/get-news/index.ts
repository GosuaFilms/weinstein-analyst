// GET /functions/v1/get-news?ticker=AAPL&lang=es
// Returns up to 5 recent news headlines for the given ticker via Yahoo Finance.
// Auth: standard Supabase JWT.

import { handleCors, jsonResponse } from '../_shared/cors.ts';

export interface NewsArticle {
  title: string;
  link: string;
  publisher: string;
  publishedAt: number; // unix timestamp (seconds)
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const url = new URL(req.url);
  const ticker = url.searchParams.get('ticker')?.toUpperCase() ?? '';
  const lang   = url.searchParams.get('lang') === 'es' ? 'es-ES' : 'en-US';

  if (!ticker) return jsonResponse({ error: 'ticker required' }, 400);

  try {
    // Yahoo Finance news search — public endpoint, no key needed
    const yahooUrl =
      `https://query1.finance.yahoo.com/v1/finance/search` +
      `?q=${encodeURIComponent(ticker)}&newsCount=6&quotesCount=0` +
      `&lang=${lang}&region=${lang === 'es-ES' ? 'ES' : 'US'}`;

    const res = await fetch(yahooUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!res.ok) return jsonResponse({ articles: [] });

    const data = await res.json();
    const raw = (data?.news ?? []) as Array<{
      title?: string;
      link?: string;
      publisher?: string;
      providerPublishTime?: number;
    }>;

    const articles: NewsArticle[] = raw
      .filter(n => n.title && n.link)
      .slice(0, 5)
      .map(n => ({
        title: n.title!,
        link: n.link!,
        publisher: n.publisher ?? '',
        publishedAt: n.providerPublishTime ?? 0,
      }));

    return jsonResponse({ articles });
  } catch (err) {
    console.error('[get-news] error:', err);
    return jsonResponse({ articles: [] });
  }
});
