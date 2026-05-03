// POST /functions/v1/telegram-webhook
// Registered as the Telegram Bot webhook URL.
// Handles incoming messages: /start <link_token> links the user's Telegram account.
//
// No auth header required — Telegram calls this endpoint directly.
// Security: validate X-Telegram-Bot-Api-Secret-Token header against TELEGRAM_WEBHOOK_SECRET.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { sendTelegramMessage } from '../_shared/telegram.ts';

Deno.serve(async (req) => {
  // Verify the request is from Telegram — secret is mandatory
  const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if (!webhookSecret) {
    console.error('[telegram-webhook] TELEGRAM_WEBHOOK_SECRET not set — rejecting request');
    return new Response('forbidden', { status: 403 });
  }
  const provided = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (provided !== webhookSecret) {
    return new Response('forbidden', { status: 403 });
  }

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
  if (!botToken) return new Response('bot token not configured', { status: 500 });

  let update: Record<string, unknown>;
  try {
    update = await req.json();
  } catch {
    return new Response('bad json', { status: 400 });
  }

  const message = (update.message ?? update.edited_message) as Record<string, unknown> | undefined;
  if (!message) return new Response('ok');

  const chatId = (message.chat as Record<string, unknown>)?.id as number;
  const text   = (message.text as string | undefined) ?? '';
  const fromUsername = (message.from as Record<string, unknown>)?.username as string | undefined;

  // ── /start <link_token> ───────────────────────────────────────────────────
  const startMatch = text.match(/^\/start\s+([A-Z0-9]{6})$/i);
  if (startMatch) {
    const token = startMatch[1].toUpperCase();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Find user by link token and update their profile
    const { data, error } = await supabase
      .from('profiles')
      .update({
        telegram_chat_id: chatId,
        telegram_link_token: null, // consume the token
      })
      .eq('telegram_link_token', token)
      .select('email')
      .single();

    if (error || !data) {
      await sendTelegramMessage(
        chatId,
        '❌ Código inválido o ya utilizado.\n\nVuelve a la app y genera un nuevo código de vinculación.',
        botToken,
      );
    } else {
      await sendTelegramMessage(
        chatId,
        `✅ <b>¡Vinculación completada!</b>\n\n` +
        `Tu cuenta <b>${data.email}</b> recibirá notificaciones Telegram cada vez que salte una alerta técnica.\n\n` +
        `Para desactivarlas, usa el panel de alertas de la app.`,
        botToken,
      );
    }
    return new Response('ok');
  }

  // ── /start (sin token) ────────────────────────────────────────────────────
  if (text.startsWith('/start')) {
    await sendTelegramMessage(
      chatId,
      `👋 <b>Weinstein Analyst Bot</b>\n\n` +
      `Para vincular tu cuenta, ve a la app → panel de Alertas → <b>Conectar Telegram</b> y envía el código que te dé.\n\n` +
      `Ejemplo: <code>/start ABC123</code>`,
      botToken,
    );
    return new Response('ok');
  }

  // ── /stop ─────────────────────────────────────────────────────────────────
  if (text.startsWith('/stop') || text.startsWith('/desconectar')) {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    await supabase
      .from('profiles')
      .update({ telegram_chat_id: null })
      .eq('telegram_chat_id', chatId);

    await sendTelegramMessage(
      chatId,
      '🔕 Notificaciones Telegram desactivadas. Puedes volver a vincular tu cuenta desde la app cuando quieras.',
      botToken,
    );
    return new Response('ok');
  }

  // Ignore everything else silently
  return new Response('ok');
});
