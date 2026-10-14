// Stripe price IDs per plan, from function secrets (set with `supabase secrets set`).
// The browser asks for a plan + billing period; the price is chosen here so a
// client can't pay for one plan and receive another.

export type PaidPlan = 'pro' | 'elite';
export type Billing = 'monthly' | 'yearly';

export function priceFor(plan: PaidPlan, billing: Billing): string | undefined {
  return Deno.env.get(`STRIPE_PRICE_${plan.toUpperCase()}_${billing.toUpperCase()}`) || undefined;
}

/** Plan granted by a subscription's price. Unknown prices (e.g. the original
 *  Pro prices kept by existing subscribers) stay on Pro. */
export function planForPrice(priceId: string | undefined): PaidPlan {
  const elite = [priceFor('elite', 'monthly'), priceFor('elite', 'yearly')];
  return priceId && elite.includes(priceId) ? 'elite' : 'pro';
}
