// POST /functions/v1/push-subscribe   → save subscription
// DELETE /functions/v1/push-subscribe  → remove subscription
//
// Body (both): { endpoint, p256dh, auth }
// Auth: standard Supabase JWT (Authorization: Bearer <token>)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey    = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Verify user JWT
  const token = authHeader.slice(7);
  const userClient = createClient(supabaseUrl, anonKey);
  const { data: { user }, error: authError } = await userClient.auth.getUser(token);
  if (authError || !user) return jsonResponse({ error: 'unauthorized' }, 401);

  const admin = createClient(supabaseUrl, serviceKey);

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { endpoint } = await req.json().catch(() => ({}));
    if (!endpoint) return jsonResponse({ error: 'endpoint required' }, 400);

    const { error } = await admin
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint);

    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ ok: true });
  }

  // ── POST ──────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const { endpoint, p256dh, auth } = body;

    if (!endpoint || !p256dh || !auth) {
      return jsonResponse({ error: 'endpoint, p256dh and auth are required' }, 400);
    }

    const userAgent = req.headers.get('User-Agent') ?? undefined;

    const { error } = await admin
      .from('push_subscriptions')
      .upsert(
        { user_id: user.id, endpoint, p256dh, auth, user_agent: userAgent },
        { onConflict: 'user_id,endpoint', ignoreDuplicates: false }
      );

    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: 'method not allowed' }, 405);
});
