// Typed client for our Supabase Edge Functions. Every call is authenticated
// with the current user's JWT (automatic via supabase-js).

import { supabase } from './supabase';
import type {
  AnalysisResult,
  OperationAnalysisResult,
  Settings,
  ChatMessage,
} from '../types';

async function invoke<T>(fn: string, body: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) supabase.functions.setAuth(session.access_token);
  const { data, error } = await supabase.functions.invoke<T>(fn, { body: body as Record<string, unknown> });
  if (error) {
    // Supabase wraps non-2xx responses in FunctionsHttpError with the response
    // stashed in error.context. Try to extract the real server error message.
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.clone().json() as { error?: string; message?: string; code?: string };
        const msg = body?.error || body?.message;
        if (msg) throw new Error(body?.code ? `${body.code}: ${msg}` : msg);
      } catch (inner) {
        if (inner instanceof Error && inner.message && inner.message !== 'Unexpected end of JSON input') {
          throw inner;
        }
      }
    }
    throw new Error(error.message);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export interface TechnicalSnapshot {
  symbol: string;
  name: string;
  currency: string;
  currentPrice: number;
  priceTimestamp: string;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  open: number;
  previousClose: number;
  sma30Weekly: number | null;
  distanceFromSMA30Pct: number | null;
  avgVolume30Weekly: number | null;
  lastWeekVolume: number | null;
  volumeRatio: number | null;
  weekly52High: number | null;
  weekly52Low: number | null;
}

export function getLivePrice(ticker: string, smaPeriod = 30) {
  return invoke<TechnicalSnapshot>('get-live-price', { ticker, smaPeriod });
}

export function analyzeMarket(input: {
  ticker?: string;
  images?: Array<{ data: string; mimeType: string }>;
  settings: Settings;
}) {
  return invoke<AnalysisResult>('analyze-market', input);
}

export function analyzeOperation(input: {
  ticker: string;
  purchaseDate: string;
  purchasePrice: string;
  shares: string;
  settings: Settings;
}) {
  return invoke<OperationAnalysisResult>('analyze-operation', input);
}

// Legacy non-streaming chat (kept for back-compat; prefer chatStream)
export function chat(input: {
  history: ChatMessage[];
  userMessage: string;
  context?: AnalysisResult | null;
  language: 'es' | 'en';
}) {
  return invoke<{ text: string }>('chat', input);
}

// Streaming chat — calls onChunk with each text delta as it arrives.
export async function chatStream(
  input: {
    history: ChatMessage[];
    userMessage: string;
    context?: AnalysisResult | null;
    language: 'es' | 'en';
  },
  onChunk: (text: string) => void
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Chat error ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line) as { chunk?: string; done?: boolean; error?: string };
        if (json.error) throw new Error(json.error);
        if (json.chunk) onChunk(json.chunk);
        if (json.done) return;
      } catch (e) {
        if (e instanceof SyntaxError) continue; // malformed line — skip
        throw e;
      }
    }
  }
}
