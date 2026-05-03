// POST /functions/v1/stripe-webhook
// Handles Stripe webhook events to keep the user's plan in sync with their subscription.
// No JWT auth — uses Stripe webhook signature verification instead.
//
// Events handled:
//   checkout.session.completed          → set plan = 'pro'
//   customer.subscription.updated       → set plan based on subscription status
//   customer.subscription.deleted       → set plan = 'free'
//   invoice.payment_failed              → optional: could downgrade after grace period

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { jsonResponse } from '../_shared/cors.ts';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

async function setPlan(
  admin: ReturnType<typeof createClient>,
  userId: string | null,
  customerId: string | null,
  plan: 'free' | 'pro',
  subscriptionId?: string,
) {
  if (!userId && !customerId) return;

  const updates: Record<string, string | null> = { plan };
  if (subscriptionId) updates.stripe_subscription_id = subscriptionId;
  if (customerId)     updates.stripe_customer_id     = customerId;

  // The Supabase builder is immutable — each .eq() returns a new instance.
  // We must chain all calls together and await the final one.
  if (userId) {
    await admin.from('profiles').update(updates).eq('id', userId);
  } else if (customerId) {
    await admin.from('profiles').update(updates).eq('stripe_customer_id', customerId);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const stripeKey     = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const supabaseUrl   = Deno.env.get('SUPABASE_URL')!;
  const serviceKey    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!stripeKey || !webhookSecret) {
    return jsonResponse({ error: 'stripe not configured' }, 503);
  }

  const body      = await req.text();
  const signature = req.headers.get('stripe-signature') ?? '';

  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err);
    return jsonResponse({ error: 'invalid signature' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId  = session.client_reference_id ?? null;
        const customerId = typeof session.customer === 'string'
          ? session.customer : session.customer?.id ?? null;
        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription : session.subscription?.id ?? undefined;
        if (session.mode === 'subscription') {
          await setPlan(admin, userId, customerId, 'pro', subscriptionId);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        const plan: 'free' | 'pro' = ACTIVE_STATUSES.has(sub.status) ? 'pro' : 'free';
        const userId = (sub.metadata?.supabase_user_id as string | undefined) ?? null;
        await setPlan(admin, userId, customerId, plan, sub.id);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        const userId = (sub.metadata?.supabase_user_id as string | undefined) ?? null;
        await setPlan(admin, userId, customerId, 'free', sub.id);
        break;
      }

      default:
        // Ignore other events
        break;
    }
  } catch (err) {
    console.error(`[stripe-webhook] error handling ${event.type}:`, err);
    return jsonResponse({ error: 'handler error' }, 500);
  }

  return jsonResponse({ received: true });
});
