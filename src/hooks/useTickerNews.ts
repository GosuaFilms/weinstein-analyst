import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface NewsArticle {
  title: string;
  link: string;
  publisher: string;
  publishedAt: number;
}

export function useTickerNews(ticker: string | undefined, language: 'es' | 'en' = 'es') {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) { setArticles([]); return; }

    let cancelled = false;
    setLoading(true);
    setArticles([]);

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-news` +
          `?ticker=${encodeURIComponent(ticker)}&lang=${language}`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled) setArticles(json.articles ?? []);
      } catch {
        // news is non-critical — fail silently
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [ticker, language]);

  return { articles, loading };
}
