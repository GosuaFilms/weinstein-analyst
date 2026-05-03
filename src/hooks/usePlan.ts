import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type Plan = 'free' | 'pro';

export interface PlanLimits {
  maxAlerts: number;
  maxVirtualPortfolios: number;       // 0 = can't save
  screenerMaxResults: number;         // 999 = unlimited
  backtestUnlocked: boolean;
  telegramUnlocked: boolean;
  dailyDigestUnlocked: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxAlerts:              2,
    maxVirtualPortfolios:   0,
    screenerMaxResults:     5,
    backtestUnlocked:       false,
    telegramUnlocked:       false,
    dailyDigestUnlocked:    false,
  },
  pro: {
    maxAlerts:              20,
    maxVirtualPortfolios:   999,
    screenerMaxResults:     999,
    backtestUnlocked:       true,
    telegramUnlocked:       true,
    dailyDigestUnlocked:    true,
  },
};

export function usePlan() {
  const { user } = useAuth();
  const [plan, setPlan]       = useState<Plan>('free');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setPlan('free'); setLoading(false); return; }
    let cancelled = false;

    supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (!cancelled) {
          setPlan((data?.plan as Plan | null) ?? 'free');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [user]);

  const limits = PLAN_LIMITS['pro']; // All features unlocked during beta
  const isPro  = true;               // TODO: set to `plan === 'pro'` when monetization is activated

  return { plan, limits, isPro, loading };
}
