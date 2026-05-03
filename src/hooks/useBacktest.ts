import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface Stage2Period {
  entryDate: string;
  entryPrice: number;
  exitDate: string | null;
  exitPrice: number | null;
  returnPct: number;
  weeksInStage2: number;
  active: boolean;
}

export interface PriceTargets {
  baseHigh: number;
  baseLow: number;
  baseHeight: number;
  baseWidthWeeks: number;
  stopProxy: number;
  target1: number;
  target2: number;
  target3: number;
  rrT1: number;
  progressPct: number;
  reachedT1: boolean;
  reachedT2: boolean;
  reachedT3: boolean;
}

export interface BacktestResult {
  ticker: string;
  currentPrice: number;
  periods: Stage2Period[];
  winRate: number;
  avgReturn: number;
  activeEntry: Stage2Period | null;
  priceTargets: PriceTargets | null;
}

export function useBacktest(ticker: string | undefined) {
  const [data, setData] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    setData(null);

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || cancelled) return;
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/backtest?ticker=${encodeURIComponent(ticker)}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled && !json.error) setData(json as BacktestResult);
      } catch {
        // non-critical — fail silently
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [ticker]);

  return { data, loading };
}
