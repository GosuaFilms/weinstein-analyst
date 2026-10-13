// Manual user-JWT check for functions deployed with verify_jwt = false.
// The new sb_publishable_ anon key is not a JWT, so the gateway check can't be
// used; each user-facing function validates the caller here instead.

import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { jsonResponse } from './cors.ts';

/** Returns the authenticated user, or a 401 Response to return as-is. */
export async function requireUser(req: Request): Promise<User | Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return jsonResponse({ error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const { data: { user }, error } = await createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  ).auth.getUser(authHeader.slice(7));

  if (error || !user) return jsonResponse({ error: 'unauthorized' }, 401);

  await logUsage(supabaseUrl, user.id, req);
  return user;
}

// Usage log for the admin metrics panel (usage_events). The event is the
// function's name, taken from the request path. Never blocks or fails the call.
async function logUsage(supabaseUrl: string, userId: string, req: Request): Promise<void> {
  const event = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? 'unknown';
  if (event === 'admin-metrics') return;
  try {
    await createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      .from('usage_events')
      .insert({ user_id: userId, event });
  } catch (e) {
    console.warn('[usage] log failed:', (e as Error).message);
  }
}
