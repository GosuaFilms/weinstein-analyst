// POST /functions/v1/stripe-checkout
// Creates a Stripe Checkout session for a paid plan (Pro or Élite).
// Uses raw Stripe REST API — no SDK, fully Deno-compatible.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { priceFor, type PaidPlan, type Billing } from '../_shared/stripePrices.ts';

async function stripePost(path: string, params: Record<string, string>, key: string) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  return res.json();
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // Cron-secret-only diagnostic: key mode and the configured prices as Stripe sees them
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret && req.headers.get('x-cron-secret') === cronSecret) {
    const key = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
    const prices: Record<string, unknown> = {};
    for (const plan of ['pro', 'elite'] as const) {
      for (const billing of ['monthly', 'yearly'] as const) {
        const id = priceFor(plan, billing);
        if (!id) { prices[`${plan}_${billing}`] = 'not set'; continue; }
        const p = await fetch(`https://api.stripe.com/v1/prices/${id}`, { headers: { Authorization: `Bearer ${key}` } }).then((r) => r.json());
        prices[`${plan}_${billing}`] = p.error
          ? p.error.message
          : { amount: p.unit_amount / 100, currency: p.currency, interval: p.recurring?.interval, active: p.active, livemode: p.livemode, tax: p.tax_behavior };
      }
    }
    return jsonResponse({ key_mode: key.startsWith('sk_live') || key.startsWith('rk_live') ? 'live' : key ? 'test' : 'missing', prices });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return jsonResponse({ error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const stripeKey   = Deno.env.get('STRIPE_SECRET_KEY');

  if (!stripeKey) return jsonResponse({ error: 'stripe not configured' }, 503);

  const token = authHeader.slice(7);
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) {
    console.error('[stripe-checkout] auth error:', authError?.message ?? 'no user');
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const { plan, billing, successUrl, cancelUrl } = body as {
    plan: PaidPlan; billing: Billing; successUrl: string; cancelUrl: string;
  };
  if (!['pro', 'elite'].includes(plan) || !['monthly', 'yearly'].includes(billing) || !successUrl || !cancelUrl) {
    return jsonResponse({ error: 'plan, billing, successUrl and cancelUrl required' }, 400);
  }
  const priceId = priceFor(plan, billing);
  if (!priceId) return jsonResponse({ error: `price for ${plan} ${billing} not configured` }, 503);

  // Fetch or create Stripe customer
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id, stripe_subscription_id, plan, email, display_name')
    .eq('id', user.id)
    .single();

  // Already subscribed: plan changes go through the billing portal, otherwise
  // Checkout would open a second, parallel subscription
  if (profile?.plan && profile.plan !== 'free' && profile.stripe_subscription_id) {
    return jsonResponse({ error: 'already subscribed', code: 'USE_PORTAL' }, 409);
  }

  let customerId: string = profile?.stripe_customer_id ?? '';
  if (!customerId) {
    const customer = await stripePost('/customers', {
      email:                        profile?.email ?? user.email ?? '',
      name:                         profile?.display_name ?? '',
      'metadata[supabase_user_id]': user.id,
    }, stripeKey);
    if (customer.error) return jsonResponse({ error: customer.error.message }, 400);
    customerId = customer.id;
    await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
  }

  const session = await stripePost('/checkout/sessions', {
    mode:                                  'subscription',
    customer:                              customerId,
    'line_items[0][price]':               priceId,
    'line_items[0][quantity]':            '1',
    success_url:                           successUrl,
    cancel_url:                            cancelUrl,
    client_reference_id:                   user.id,
    'subscription_data[metadata][supabase_user_id]': user.id,
    'metadata[plan]':                      plan,
    allow_promotion_codes:                 'true',
  }, stripeKey);

  if (session.error) return jsonResponse({ error: session.error.message }, 400);
  return jsonResponse({ url: session.url });
});
