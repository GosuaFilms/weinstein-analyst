// Thin wrapper around the Telegram Bot API — no external deps.

const TELEGRAM_API = 'https://api.telegram.org';

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  botToken: string,
): Promise<boolean> {
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
    if (!res.ok) {
      const body = await res.text();
      console.error(`[Telegram] sendMessage failed ${res.status}: ${body}`);
    }
    return res.ok;
  } catch (err) {
    console.error('[Telegram] fetch error:', err);
    return false;
  }
}
