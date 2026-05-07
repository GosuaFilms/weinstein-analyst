// POST /functions/v1/stripe-checkout
// Creates a Stripe Checkout session for upgrading to Pro.
// Uses raw Stripe REST API — no SDK, fully Deno-compatible.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

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

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return jsonResponse({ error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const stripeKey   = Deno.env.get('STRIPE_SECRET_KEY');

  if (!stripeKey) return jsonResponse({ error: 'stripe not configured' }, 503);

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await createClient(supabaseUrl, anonKey)
    .auth.getUser(token);
  if (authError || !user) return jsonResponse({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const { priceId, successUrl, cancelUrl } = body as {
    priceId: string; successUrl: string; cancelUrl: string;
  };
  if (!priceId || !successUrl || !cancelUrl) {
    return jsonResponse({ error: 'priceId, successUrl and cancelUrl required' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // Fetch or create Stripe customer
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id, email, display_name')
    .eq('id', user.id)
    .single();

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
    allow_promotion_codes:                 'true',
  }, stripeKey);

  if (session.error) return jsonResponse({ error: session.error.message }, 400);
  return jsonResponse({ url: session.url });
});
