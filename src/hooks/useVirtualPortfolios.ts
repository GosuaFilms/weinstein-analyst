import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface SavedVirtualPortfolio {
  id: string;
  label: string;
  currency: string;
  amount: number;
  indices: string[];
  generatedAt: string;
  totalAllocatedPct: number;
  cashReservePct: number;
  maxPortfolioRiskPct: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  positions: any[];
  createdAt: string;
}

function toSaved(row: Record<string, unknown>): SavedVirtualPortfolio {
  return {
    id: row.id as string,
    label: (row.label as string) || '',
    currency: row.currency as string,
    amount: Number(row.amount),
    indices: (row.indices as string[]) || [],
    generatedAt: row.generated_at as string,
    totalAllocatedPct: Number(row.total_allocated_pct),
    cashReservePct: Number(row.cash_reserve_pct),
    maxPortfolioRiskPct: Number(row.max_portfolio_risk_pct),
    positions: (row.positions as unknown[]) || [],
    createdAt: row.created_at as string,
  };
}

export function useVirtualPortfolios() {
  const { user } = useAuth();
  const [portfolios, setPortfolios] = useState<SavedVirtualPortfolio[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setPortfolios([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('virtual_portfolios')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) setPortfolios(data.map(r => toSaved(r as Record<string, unknown>)));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (
    result: {
      portfolioCurrency: string;
      portfolioAmount: number;
      indicesScanned: string[];
      scannedAt: string;
      totalAllocatedPct: number;
      cashReservePct: number;
      maxPortfolioRiskPct: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      positions: any[];
    },
    label?: string
  ): Promise<SavedVirtualPortfolio> => {
    if (!user) throw new Error('Not authenticated');

    const autoLabel = label || `${result.portfolioCurrency} ${Number(result.portfolioAmount).toLocaleString('es-ES')} — ${new Date(result.scannedAt).toLocaleDateString('es-ES')}`;

    const { data, error } = await supabase
      .from('virtual_portfolios')
      .insert({
        user_id: user.id,
        label: autoLabel,
        currency: result.portfolioCurrency,
        amount: result.portfolioAmount,
        indices: result.indicesScanned,
        generated_at: result.scannedAt,
        total_allocated_pct: result.totalAllocatedPct,
        cash_reserve_pct: result.cashReservePct,
        max_portfolio_risk_pct: result.maxPortfolioRiskPct,
        positions: result.positions,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    const saved = toSaved(data as Record<string, unknown>);
    setPortfolios(prev => [saved, ...prev]);
    return saved;
  }, [user]);

  const rename = useCallback(async (id: string, label: string) => {
    const { error } = await supabase
      .from('virtual_portfolios')
      .update({ label })
      .eq('id', id);
    if (error) throw new Error(error.message);
    setPortfolios(prev => prev.map(p => p.id === id ? { ...p, label } : p));
  }, []);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('virtual_portfolios')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
    setPortfolios(prev => prev.filter(p => p.id !== id));
  }, []);

  return { portfolios, loading, load, save, rename, remove };
}
