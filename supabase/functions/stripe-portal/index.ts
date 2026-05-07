// POST /functions/v1/stripe-portal
// Opens the Stripe Customer Portal so the user can manage their subscription.
// Uses raw Stripe REST API — no SDK, fully Deno-compatible.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

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

  const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      customer:   profile.stripe_customer_id,
      return_url: returnUrl,
    }).toString(),
  });
  const session = await res.json();
  if (session.error) return jsonResponse({ error: session.error.message }, 400);
  return jsonResponse({ url: session.url });
});
