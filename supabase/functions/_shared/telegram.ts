// Thin wrapper around the Telegram Bot API — no external deps.

const TELEGRAM_API = 'https://api.telegram.org';

/** Sends a message and returns Telegram's own error description on failure (never the token). */
export async function trySendTelegram(
  chatId: number | string,
  text: string,
  botToken: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => ({})) as { description?: string };
    const error = `${res.status} ${body.description ?? ''}`.trim();
    console.error(`[Telegram] sendMessage failed: ${error}`);
    return { ok: false, error };
  } catch (err) {
    console.error('[Telegram] fetch error:', err);
    return { ok: false, error: (err as Error).message };
  }
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  botToken: string,
): Promise<boolean> {
  return (await trySendTelegram(chatId, text, botToken)).ok;
}
