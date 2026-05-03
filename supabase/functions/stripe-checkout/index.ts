// POST /functions/v1/stripe-checkout
// Creates a Stripe Checkout session for upgrading to Pro.
// Body: { priceId: string, successUrl: string, cancelUrl: string }
// Returns: { url: string }
// Auth: standard Supabase JWT.

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return jsonResponse({ error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey    = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const stripeKey  = Deno.env.get('STRIPE_SECRET_KEY');

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

  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
  const admin  = createClient(supabaseUrl, serviceKey);

  // Fetch or create Stripe customer
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id, email, display_name')
    .eq('id', user.id)
    .single();

  let customerId: string = profile?.stripe_customer_id ?? '';
  if (!customerId) {
    const customer = await stripe.customers.create({
      email:    profile?.email ?? user.email,
      name:     profile?.display_name ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await admin
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id);
  }

  const session = await stripe.checkout.sessions.create({
    mode:               'subscription',
    customer:           customerId,
    line_items:         [{ price: priceId, quantity: 1 }],
    success_url:        successUrl,
    cancel_url:         cancelUrl,
    client_reference_id: user.id,
    subscription_data:  { metadata: { supabase_user_id: user.id } },
    allow_promotion_codes: true,
  });

  return jsonResponse({ url: session.url });
});
