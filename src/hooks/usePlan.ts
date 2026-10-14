import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type Plan = 'free' | 'pro' | 'elite';

export interface PlanLimits {
  maxAlerts: number;
  maxVirtualPortfolios: number;       // 0 = can't save
  screenerMaxResults: number;         // 999 = unlimited
  backtestUnlocked: boolean;
  telegramUnlocked: boolean;
  dailyDigestUnlocked: boolean;
  maxAnalyses: number;                // per `analysesPer`
  analysesPer: 'month' | 'day';
  maxOperations: number;              // per `analysesPer`; 0 = locked
}

// The AI quotas are enforced server-side (supabase/functions/_shared/quota.ts);
// keep them in sync. These values drive the UI only.
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxAlerts:              1,
    maxVirtualPortfolios:   0,
    screenerMaxResults:     5,
    backtestUnlocked:       false,
    telegramUnlocked:       false,
    dailyDigestUnlocked:    false,
    maxAnalyses:            3,
    analysesPer:            'month',
    maxOperations:          0,
  },
  pro: {
    maxAlerts:              20,
    maxVirtualPortfolios:   999,
    screenerMaxResults:     999,
    backtestUnlocked:       true,
    telegramUnlocked:       true,
    dailyDigestUnlocked:    true,
    maxAnalyses:            40,
    analysesPer:            'month',
    maxOperations:          10,
  },
  elite: {
    maxAlerts:              100,
    maxVirtualPortfolios:   999,
    screenerMaxResults:     999,
    backtestUnlocked:       true,
    telegramUnlocked:       true,
    dailyDigestUnlocked:    true,
    maxAnalyses:            15,             // fair-use cap of "unlimited"
    analysesPer:            'day',
    maxOperations:          15,
  },
};

export const PLAN_LABEL: Record<Plan, string> = { free: 'Gratis', pro: 'Pro', elite: 'Élite' };

interface AiUsage {
  plan: Plan;
  analysis_month: number;
  analysis_day: number;
  operation_month: number;
  operation_day: number;
}

export function usePlan() {
  const { user } = useAuth();
  const [usage, setUsage]     = useState<AiUsage | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setUsage(null); setLoading(false); return; }
    const { data } = await supabase.rpc('my_ai_usage');
    setUsage((data as AiUsage | null) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const plan: Plan = usage?.plan === 'pro' || usage?.plan === 'elite' ? usage.plan : 'free';
  const limits = PLAN_LIMITS[plan];
  const analysesUsed  = usage ? usage[`analysis_${limits.analysesPer}`] : 0;
  const operationsUsed = usage ? usage[`operation_${limits.analysesPer}`] : 0;

  return {
    plan,
    limits,
    isPro:   plan !== 'free',   // any paid plan unlocks the Pro features
    isElite: plan === 'elite',
    analysesUsed,
    operationsUsed,
    analysisLimitReached:  analysesUsed  >= limits.maxAnalyses,
    operationLimitReached: operationsUsed >= limits.maxOperations,
    refreshUsage: refresh,
    loading,
  };
}
