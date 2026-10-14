// Server-side AI quotas per plan. The browser shows the same numbers
// (src/hooks/usePlan.ts PLAN_LIMITS) but only this check is authoritative —
// every analysis costs real money, so it can't rely on the client.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { jsonResponse } from './cors.ts';

export type Plan = 'free' | 'pro' | 'elite';
export type AiKind = 'analysis' | 'operation';

interface Quota { limit: number; per: 'month' | 'day' }

// Keep in sync with PLAN_LIMITS in src/hooks/usePlan.ts
export const AI_QUOTAS: Record<Plan, Record<AiKind, Quota>> = {
  free:  { analysis: { limit: 3,  per: 'month' }, operation: { limit: 0,  per: 'month' } },
  pro:   { analysis: { limit: 40, per: 'month' }, operation: { limit: 10, per: 'month' } },
  // "Unlimited" with a fair-use cap per day
  elite: { analysis: { limit: 15, per: 'day' },   operation: { limit: 15, per: 'day' } },
};

function admin() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

/** null when the user may run one more `kind`; otherwise a 402 Response to return as-is. */
export async function checkAiQuota(userId: string, kind: AiKind): Promise<Response | null> {
  const { data, error } = await admin().rpc('ai_usage_for', { p_user: userId });
  if (error) {
    // Never block paying users on a metering failure; log it instead
    console.error('[quota] usage lookup failed:', error.message);
    return null;
  }
  const usage = data as Record<string, number | string>;
  const plan = (['pro', 'elite'].includes(usage.plan as string) ? usage.plan : 'free') as Plan;
  const quota = AI_QUOTAS[plan][kind];
  const used = Number(usage[`${kind}_${quota.per}`] ?? 0);
  if (used < quota.limit) return null;

  return jsonResponse({
    error: plan === 'free' && quota.limit === 0
      ? 'Esta función requiere un plan de pago.'
      : `Has alcanzado el límite de tu plan (${quota.limit} ${quota.per === 'day' ? 'al día' : 'al mes'}).`,
    code: 'QUOTA_EXCEEDED',
    plan, kind, used, limit: quota.limit, per: quota.per,
  }, 402);
}

/** Records one successful generation. Never fails the request. */
export async function recordAiUsage(userId: string, kind: AiKind): Promise<void> {
  const { error } = await admin().from('ai_usage').insert({ user_id: userId, kind });
  if (error) console.error('[quota] record failed:', error.message);
}
