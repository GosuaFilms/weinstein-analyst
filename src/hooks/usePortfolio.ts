import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface PortfolioPosition {
  id: string;
  symbol: string;
  name: string;
  currency: string;
  entryPrice: number;
  shares: number;
  entryDate: string;
  stopLoss: number | null;
  notes: string;
  createdAt: string;
}

export interface PriceData {
  price: number | null;
  name: string;
  currency: string;
  error?: string;
}

type NewPosition = Omit<PortfolioPosition, 'id' | 'createdAt'>;

function toPosition(row: Record<string, unknown>): PortfolioPosition {
  return {
    id: row.id as string,
    symbol: (row.symbol as string).toUpperCase(),
    name: (row.name as string) || '',
    currency: (row.currency as string) || 'USD',
    entryPrice: Number(row.entry_price),
    shares: Number(row.shares),
    entryDate: row.entry_date as string,
    stopLoss: row.stop_loss != null ? Number(row.stop_loss) : null,
    notes: (row.notes as string) || '',
    createdAt: row.created_at as string,
  };
}

export function usePortfolio() {
  const { user } = useAuth();
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setPositions([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('portfolio_positions')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) setPositions(data.map(toPosition));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const refreshPrices = useCallback(async (pos?: PortfolioPosition[]) => {
    const list = pos ?? positions;
    if (list.length === 0) return;
    setRefreshing(true);
    try {
      const tickers = [...new Set(list.map(p => p.symbol))];
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) supabase.functions.setAuth(session.access_token);
      const { data, error } = await supabase.functions.invoke('portfolio-prices', {
        body: { tickers },
      });
      if (!error && data) setPrices(prev => ({ ...prev, ...data }));
    } finally {
      setRefreshing(false);
    }
  }, [positions]);

  const add = useCallback(async (pos: NewPosition): Promise<PortfolioPosition> => {
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase
      .from('portfolio_positions')
      .insert({
        user_id: user.id,
        symbol: pos.symbol.toUpperCase(),
        name: pos.name,
        currency: pos.currency,
        entry_price: pos.entryPrice,
        shares: pos.shares,
        entry_date: pos.entryDate,
        stop_loss: pos.stopLoss ?? null,
        notes: pos.notes,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    const newPos = toPosition(data as Record<string, unknown>);
    setPositions(prev => [newPos, ...prev]);
    return newPos;
  }, [user]);

  const update = useCallback(async (id: string, patch: Partial<NewPosition>) => {
    const dbPatch: Record<string, unknown> = {};
    if (patch.stopLoss !== undefined) dbPatch.stop_loss = patch.stopLoss;
    if (patch.shares !== undefined) dbPatch.shares = patch.shares;
    if (patch.entryPrice !== undefined) dbPatch.entry_price = patch.entryPrice;
    if (patch.notes !== undefined) dbPatch.notes = patch.notes;
    if (patch.name !== undefined) dbPatch.name = patch.name;

    const { error } = await supabase
      .from('portfolio_positions')
      .update(dbPatch)
      .eq('id', id);
    if (error) throw new Error(error.message);
    setPositions(prev =>
      prev.map(p => p.id === id ? { ...p, ...patch } : p)
    );
  }, []);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('portfolio_positions')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
    setPositions(prev => prev.filter(p => p.id !== id));
  }, []);

  return { positions, prices, loading, refreshing, load, refreshPrices, add, update, remove };
}
