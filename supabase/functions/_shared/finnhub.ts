// Thin Finnhub client for the Edge runtime. Free tier: 60 req/min.
// Docs: https://finnhub.io/docs/api

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

export interface FinnhubQuote {
  c: number;  // current price
  d: number;  // change
  dp: number; // percent change
  h: number;  // day high
  l: number;  // day low
  o: number;  // day open
  pc: number; // previous close
  t: number;  // UNIX timestamp (seconds)
}

export interface FinnhubProfile {
  name: string;
  ticker: string;
  exchange: string;
  currency: string;
  logo: string;
  marketCapitalization: number;
  finnhubIndustry: string;
}

export interface FinnhubCandles {
  c: number[]; // close
  h: number[]; // high
  l: number[]; // low
  o: number[]; // open
  t: number[]; // timestamps
  v: number[]; // volume
  s: 'ok' | 'no_data';
}

function getKey(): string {
  const key = Deno.env.get('FINNHUB_API_KEY');
  if (!key) throw new Error('FINNHUB_API_KEY not set in Edge Function secrets');
  return key;
}

export async function getQuote(symbol: string): Promise<FinnhubQuote> {
  const res = await fetch(`${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${getKey()}`);
  if (!res.ok) throw new Error(`Finnhub quote failed: ${res.status}`);
  const data = await res.json() as FinnhubQuote;
  if (data.c === 0 && data.pc === 0) {
    throw new Error(`Ticker "${symbol}" not found on Finnhub`);
  }
  return data;
}

export async function getProfile(symbol: string): Promise<FinnhubProfile | null> {
  const res = await fetch(`${FINNHUB_BASE}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${getKey()}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data?.name ? data as FinnhubProfile : null;
}

/**
 * Weekly candles for the last N weeks — used to compute SMA30 (weekly) per
 * Weinstein's method. Returns oldest → newest.
 */
export async function getWeeklyCandles(symbol: string, weeks = 40): Promise<FinnhubCandles> {
  const now = Math.floor(Date.now() / 1000);
  const from = now - weeks * 7 * 24 * 60 * 60;
  const url = `${FINNHUB_BASE}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=W&from=${from}&to=${now}&token=${getKey()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub candles failed: ${res.status}`);
  return await res.json() as FinnhubCandles;
}

export function computeSMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / period;
}

export function computeVolumeAvg(volumes: number[], period: number): number | null {
  if (volumes.length < period) return null;
  const slice = volumes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export interface TechnicalSnapshot {
  symbol: string;
  name: string;
  currency: string;
  currentPrice: number;
  priceTimestamp: string;   // ISO 8601
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

export async function getTechnicalSnapshot(
  symbol: string,
  smaPeriod = 30
): Promise<TechnicalSnapshot> {
  const [quote, profile, candles] = await Promise.all([
    getQuote(symbol),
    getProfile(symbol),
    getWeeklyCandles(symbol, Math.max(smaPeriod + 10, 60)),
  ]);

  const hasCandles = candles.s === 'ok' && candles.c?.length > 0;
  const sma = hasCandles ? computeSMA(candles.c, smaPeriod) : null;
  const volAvg = hasCandles ? computeVolumeAvg(candles.v, smaPeriod) : null;
  const lastVol = hasCandles ? candles.v[candles.v.length - 1] : null;

  return {
    symbol: symbol.toUpperCase(),
    name: profile?.name ?? symbol.toUpperCase(),
    currency: profile?.currency ?? 'USD',
    currentPrice: quote.c,
    priceTimestamp: new Date(quote.t * 1000).toISOString(),
    change: quote.d,
    changePercent: quote.dp,
    dayHigh: quote.h,
    dayLow: quote.l,
    open: quote.o,
    previousClose: quote.pc,
    sma30Weekly: sma,
    distanceFromSMA30Pct: sma ? ((quote.c - sma) / sma) * 100 : null,
    avgVolume30Weekly: volAvg,
    lastWeekVolume: lastVol,
    volumeRatio: volAvg && lastVol ? lastVol / volAvg : null,
    weekly52High: hasCandles ? Math.max(...candles.h.slice(-52)) : null,
    weekly52Low: hasCandles ? Math.min(...candles.l.slice(-52)) : null,
  };
}
