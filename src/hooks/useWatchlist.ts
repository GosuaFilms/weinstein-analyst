import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface WatchlistItem {
  id: string;
  symbol: string;
  name: string | null;
  addedAt: number;
}

interface DbRow {
  id: string;
  symbol: string;
  name: string | null;
  added_at: string;
}

export function useWatchlist() {
  const { user } = useAuth();
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!user) { setWatchlist([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('watchlist')
      .select('*')
      .order('added_at', { ascending: false });
    setWatchlist(
      (data as DbRow[] | null)?.map(row => ({
        id: row.id,
        symbol: row.symbol,
        name: row.name,
        addedAt: new Date(row.added_at).getTime(),
      })) ?? []
    );
    setLoading(false);
  }, [user]);

  useEffect(() => { reload(); }, [reload]);

  const add = useCallback(async (symbol: string, name?: string) => {
    if (!user) throw new Error('Inicia sesión para usar la watchlist.');
    const { error } = await supabase.from('watchlist').upsert(
      { user_id: user.id, symbol: symbol.toUpperCase(), name: name ?? null },
      { onConflict: 'user_id,symbol' }
    );
    if (error) throw new Error(error.message);
    await reload();
  }, [user, reload]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('watchlist').delete().eq('id', id);
    if (error) throw new Error(error.message);
    setWatchlist(prev => prev.filter(w => w.id !== id));
  }, []);

  const has = useCallback(
    (symbol: string) => watchlist.some(w => w.symbol === symbol.toUpperCase()),
    [watchlist]
  );

  return { watchlist, loading, add, remove, has, reload };
}
