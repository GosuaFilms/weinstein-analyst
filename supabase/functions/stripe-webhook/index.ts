// POST /functions/v1/stripe-webhook
// Handles Stripe webhook events to keep the user's plan in sync.
// Uses manual HMAC signature verification — no Stripe SDK needed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { jsonResponse } from '../_shared/cors.ts';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

// Verify Stripe webhook signature manually (HMAC-SHA256)
async function verifyStripeSignature(body: string, signature: string, secret: string): Promise<boolean> {
  const parts: Record<string, string> = {};
  for (const pair of signature.split(',')) {
    const [k, v] = pair.split('=');
    parts[k] = v;
  }
  const timestamp = parts['t'];
  const sig = parts['v1'];
  if (!timestamp || !sig) return false;

  const payload = `${timestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const computed = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
  return computed === sig;
}

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

  if (userId) {
    await admin.from('profiles').update(updates).eq('id', userId);
  } else if (customerId) {
    await admin.from('profiles').update(updates).eq('stripe_customer_id', customerId);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const supabaseUrl   = Deno.env.get('SUPABASE_URL')!;
  const serviceKey    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!webhookSecret) return jsonResponse({ error: 'stripe not configured' }, 503);

  const body      = await req.text();
  const signature = req.headers.get('stripe-signature') ?? '';

  const valid = await verifyStripeSignature(body, signature, webhookSecret);
  if (!valid) {
    console.error('[stripe-webhook] invalid signature');
    return jsonResponse({ error: 'invalid signature' }, 400);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const event = JSON.parse(body) as { type: string; data: { object: any } };
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId       = session.client_reference_id ?? null;
        const customerId   = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
        if (session.mode === 'subscription') {
          await setPlan(admin, userId, customerId, 'pro', subscriptionId);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub        = event.data.object;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
        const plan: 'free' | 'pro' = ACTIVE_STATUSES.has(sub.status) ? 'pro' : 'free';
        const userId     = sub.metadata?.supabase_user_id ?? null;
        await setPlan(admin, userId, customerId, plan, sub.id);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub        = event.data.object;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
        const userId     = sub.metadata?.supabase_user_id ?? null;
        await setPlan(admin, userId, customerId, 'free', sub.id);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`[stripe-webhook] error handling ${event.type}:`, err);
    return jsonResponse({ error: 'handler error' }, 500);
  }

  return jsonResponse({ received: true });
});
