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
  const { data, error } = await supabase.functions.invoke<T>(fn, { body: body as Record<string, unknown> });
  if (error) {
    // Supabase wraps non-2xx responses in FunctionsHttpError with the response
    // stashed in error.context. Try to extract the real server error message.
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.clone().json() as { error?: string };
        if (body?.error) throw new Error(body.error);
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

export function chat(input: {
  history: ChatMessage[];
  userMessage: string;
  context?: AnalysisResult | null;
  language: 'es' | 'en';
}) {
  return invoke<{ text: string }>('chat', input);
}
