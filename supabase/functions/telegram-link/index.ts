// GET  /functions/v1/telegram-link  → get current Telegram status (chat_id set?)
// POST /functions/v1/telegram-link  → generate (or refresh) a link token
// DELETE /functions/v1/telegram-link → disconnect Telegram
//
// Auth: standard Supabase JWT

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

function randomToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,0,1 to avoid confusion
  return Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map(b => chars[b % chars.length])
    .join('');
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return jsonResponse({ error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey    = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await createClient(supabaseUrl, anonKey)
    .auth.getUser(token);
  if (authError || !user) return jsonResponse({ error: 'unauthorized' }, 401);

  const admin = createClient(supabaseUrl, serviceKey);
  const botUsername = Deno.env.get('TELEGRAM_BOT_USERNAME') ?? '';

  // ── GET — current status ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data } = await admin
      .from('profiles')
      .select('telegram_chat_id, telegram_link_token')
      .eq('id', user.id)
      .maybeSingle();

    return jsonResponse({
      connected: !!data?.telegram_chat_id,
      chat_id: data?.telegram_chat_id ?? null,
      link_token: data?.telegram_link_token ?? null,
      bot_username: botUsername,
    });
  }

  // ── POST — generate link token ────────────────────────────────────────────
  if (req.method === 'POST') {
    const newToken = randomToken();
    // Upsert to handle the case where the profile row doesn't exist yet
    const { error } = await admin
      .from('profiles')
      .upsert(
        { id: user.id, email: user.email ?? '', telegram_link_token: newToken, telegram_chat_id: null },
        { onConflict: 'id' },
      );

    if (error) return jsonResponse({ error: error.message }, 500);

    return jsonResponse({
      link_token: newToken,
      bot_username: botUsername,
      deep_link: `https://t.me/${botUsername}?start=${newToken}`,
    });
  }

  // ── DELETE — disconnect ───────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    await admin
      .from('profiles')
      .update({ telegram_chat_id: null, telegram_link_token: null })
      .eq('id', user.id);

    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: 'method not allowed' }, 405);
});
