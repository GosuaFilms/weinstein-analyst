// Manual user-JWT check for functions deployed with verify_jwt = false.
// The new sb_publishable_ anon key is not a JWT, so the gateway check can't be
// used; each user-facing function validates the caller here instead.

import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { jsonResponse } from './cors.ts';

/** Returns the authenticated user, or a 401 Response to return as-is. */
export async function requireUser(req: Request): Promise<User | Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return jsonResponse({ error: 'unauthorized' }, 401);

  const { data: { user }, error } = await createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  ).auth.getUser(authHeader.slice(7));

  if (error || !user) return jsonResponse({ error: 'unauthorized' }, 401);
  return user;
}
