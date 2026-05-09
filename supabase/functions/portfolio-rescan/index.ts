// POST /functions/v1/portfolio-rescan
// Body: { symbols: string[] }
// Checks the current Weinstein stage for each symbol in a virtual portfolio.
// Returns stage info per symbol + sends Telegram alerts for exited Stage 2 positions.
// Auth: standard Supabase JWT.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getTechnicalSnapshot } from '../_shared/marketData.ts';
import { classifyStage } from '../_shared/weinstein.ts';
import { sendTelegramMessage } from '../_shared/telegram.ts';

const MAX_CONCURRENT = 8;
async function pooledMap<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) { const i = idx++; results[i] = await fn(items[i]); }
  }
  await Promise.all(Array.from({ length: MAX_CONCURRENT }, worker));
  return results;
}

export interface RescanItem {
  symbol: string;
  currentStage: string;
  confidence: 'low' | 'medium' | 'high';
  currentPrice: number;
  mansfieldRS: number | null;
  exitedStage2: boolean;  // was Stage 2 before, now it's not
  error?: string;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return jsonResponse({ error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey    = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const botToken   = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
  const appUrl     = Deno.env.get('APP_URL') ?? 'https://www.alphastage.finance';

  // Validate JWT
  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await createClient(supabaseUrl, anonKey)
    .auth.getUser(token);
  if (authError || !user) return jsonResponse({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const symbols: string[] = body.symbols ?? [];
  if (symbols.length === 0) return jsonResponse({ error: 'symbols array required' }, 400);
  if (symbols.length > 20) return jsonResponse({ error: 'max 20 symbols per request' }, 400);

  // Scan each symbol
  const items: RescanItem[] = await pooledMap(symbols, async (symbol) => {
    try {
      const snap = await getTechnicalSnapshot(symbol);
      const cls  = classifyStage(snap);
      return {
        symbol,
        currentStage: cls.stage,
        confidence:   cls.confidence,
        currentPrice: snap.currentPrice,
        mansfieldRS:  snap.mansfieldRS ?? null,
        exitedStage2: cls.stage !== 'STAGE_2',
      };
    } catch (err) {
      return {
        symbol,
        currentStage: 'UNKNOWN',
        confidence: 'low' as const,
        currentPrice: 0,
        mansfieldRS: null,
        exitedStage2: false,
        error: (err as Error).message,
      };
    }
  });

  const exited = items.filter(i => i.exitedStage2 && !i.error);

  // Send Telegram alert if any position has exited Stage 2
  if (botToken && exited.length > 0) {
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await admin
      .from('profiles')
      .select('telegram_chat_id')
      .eq('id', user.id)
      .single();

    if (profile?.telegram_chat_id) {
      const stageLabel: Record<string, string> = {
        STAGE_1: 'Stage 1 (consolidación)',
        STAGE_3: 'Stage 3 (techo)',
        STAGE_4: 'Stage 4 (bajista)',
        UNKNOWN: 'desconocido',
      };
      let msg = `⚠️ <b>Alerta de cartera — Stage 2 comprometido</b>\n\n`;
      msg += `Los siguientes valores de tu cartera virtual han salido de Stage 2:\n\n`;
      for (const item of exited) {
        msg += `• <b>${item.symbol}</b> → ${stageLabel[item.currentStage] ?? item.currentStage}`;
        if (item.mansfieldRS != null) msg += ` · RS ${item.mansfieldRS.toFixed(1)}`;
        msg += '\n';
      }
      msg += `\n<a href="${appUrl}">Ver cartera →</a>`;
      await sendTelegramMessage(profile.telegram_chat_id, msg, botToken)
        .catch(err => console.error('[portfolio-rescan] Telegram failed:', err));
    }
  }

  return jsonResponse({ items, exitedCount: exited.length });
});
