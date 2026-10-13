// POST /functions/v1/admin-metrics
// Business metrics for the owner: signups, active users, conversion to Pro,
// usage per tool. Only for the emails in the ADMIN_EMAILS secret (comma list);
// anyone else gets 403, which the UI uses to hide the panel.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireUser } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const authed = await requireUser(req);
  if (authed instanceof Response) return authed;

  const admins = (Deno.env.get('ADMIN_EMAILS') ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!authed.email || !admins.includes(authed.email.toLowerCase())) {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await admin.rpc('admin_metrics');
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse(data);
});
