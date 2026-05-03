// POST /functions/v1/stripe-portal
// Opens the Stripe Customer Portal so the user can manage their subscription.
// Body: { returnUrl: string }
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
  const { returnUrl } = body as { returnUrl: string };
  if (!returnUrl) return jsonResponse({ error: 'returnUrl required' }, 400);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return jsonResponse({ error: 'no stripe customer found' }, 404);
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
  const session = await stripe.billingPortal.sessions.create({
    customer:   profile.stripe_customer_id,
    return_url: returnUrl,
  });

  return jsonResponse({ url: session.url });
});
