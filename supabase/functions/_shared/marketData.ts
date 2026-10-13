// Market data client backed by Twelve Data (Venture plan: external display).
// Every price in the app comes from here. Tickers keep the app's Yahoo-style
// spelling (SAN.MC, BRK-B, BT-A.L) and are translated to a Twelve Data symbol
// plus its market (MIC): a bare symbol can match another listing ("SPX" is a
// Canadian penny stock, "EQR" a German line). Weekly series are cached in
// public.market_cache and shared by every function and user.
// Docs: https://twelvedata.com/docs

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { ALL_TICKERS } from './indices.ts';

const TD_BASE = 'https://api.twelvedata.com';
const WEEKS = 130; // ≥ 52w Mansfield RS + its 13w MA + slope buffer

function getKey(): string {
  const key = Deno.env.get('TWELVEDATA_API_KEY');
  if (!key) throw new Error('TWELVEDATA_API_KEY not set in Edge Function secrets');
  return key;
}

interface TDQuote {
  symbol: string;
  name?: string;
  currency?: string;
  datetime?: string;
  timestamp?: number;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  previous_close?: string;
  change?: string;
  percent_change?: string;
  status?: string;
  code?: number;
  message?: string;
}

// ─── Ticker ↔ Twelve Data instrument ────────────────────────────────────────

/** A Twelve Data instrument: symbol plus the market that disambiguates it. */
export interface TdRef {
  symbol: string;
  mic_code?: string;
  country?: string;
}

// Yahoo-style suffix → ISO market code (MIC)
const SUFFIX_MIC: Record<string, string> = {
  MC: 'XMAD', DE: 'XETR', F: 'XFRA', PA: 'XPAR', AS: 'XAMS', BR: 'XBRU', L: 'XLON',
  MI: 'XMIL', LS: 'XLIS', SW: 'XSWX', HE: 'XHEL', ST: 'XSTO', CO: 'XCSE', OL: 'XOSL',
  IR: 'XDUB', VI: 'XWBO', T: 'XTKS', HK: 'XHKG', AX: 'XASX', TO: 'XTSE', V: 'XTSX',
};
const MIC_SUFFIX: Record<string, string> = Object.fromEntries(
  Object.entries(SUFFIX_MIC).map(([suffix, mic]) => [mic, suffix]),
);
const US_MICS = new Set(['XNAS', 'XNYS', 'ARCX', 'BATS', 'XASE']);
const CRYPTO_BASE = /^(BTC|ETH|SOL|XRP|ADA|DOGE|BNB|LTC|AVAX|DOT|MATIC|LINK|ATOM|TRX|UNI|SHIB)$/;

/** App ticker → Twelve Data instrument; null when it needs a search (a company name). */
export function toTdRef(ticker: string): TdRef | null {
  const t = ticker.trim().toUpperCase();
  const pair = t.match(/^([A-Z]{2,6})[/-]([A-Z]{3,4})$/);
  if (pair && (t.includes('/') || CRYPTO_BASE.test(pair[1]))) return { symbol: `${pair[1]}/${pair[2]}` };
  const dot = t.lastIndexOf('.');
  if (dot > 0) {
    const mic = SUFFIX_MIC[t.slice(dot + 1)];
    if (mic) return { symbol: t.slice(0, dot).replace(/-/g, '.'), mic_code: mic };
  }
  if (/^[A-Z][A-Z0-9]{0,5}([.-][A-Z])?$/.test(t)) return { symbol: t.replace('-', '.'), country: 'United States' };
  return null;
}

/** Twelve Data instrument → the app's ticker spelling. */
function toAppTicker(symbol: string, mic?: string): string {
  if (!mic || US_MICS.has(mic)) return symbol.replace('.', '-');
  const suffix = MIC_SUFFIX[mic];
  return suffix ? `${symbol.replace(/\./g, '-')}.${suffix}` : symbol;
}

const tdParams = (ref: TdRef): Record<string, string> => ({
  symbol: ref.symbol,
  ...(ref.mic_code ? { mic_code: ref.mic_code } : ref.country ? { country: ref.country } : {}),
});
const refKey = (ref: TdRef) => `${ref.symbol}@${ref.mic_code ?? ref.country ?? ''}`;

// ─── HTTP with per-minute credit back-off ───────────────────────────────────

// deno-lint-ignore no-explicit-any
async function tdGet(path: string, params: Record<string, string>): Promise<any> {
  const url = `${TD_BASE}/${path}?${new URLSearchParams({ ...params, apikey: getKey() })}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    if (res.status !== 429 && body?.code !== 429) return body;
    if (attempt >= 2) throw new Error('Twelve Data: límite de consultas por minuto alcanzado; inténtalo en un minuto');
    // Credits reset at the start of each minute
    await new Promise((r) => setTimeout(r, (61 - new Date().getUTCSeconds()) * 1000));
  }
}

// Brand names whose legal name in the exchange directory doesn't contain them
const NAME_ALIASES: Record<string, string> = {
  inditex: 'ITX.MC', zara: 'ITX.MC', iberia: 'IAG.MC', 'red electrica': 'RED.MC',
  google: 'GOOGL', facebook: 'META', 'coca cola': 'KO', mcdonalds: 'MCD',
};

// Markets searched by company name, in tie-break order (the app's users are Spanish)
const NAME_MARKETS = ['XMAD', 'US', 'XETR', 'XPAR', 'XAMS', 'XBRU', 'XLON'];

const UNIVERSE = new Set(ALL_TICKERS);
const LEGAL_FORM = /\b(s a|sa|s a u|ag|aktiengesellschaft|se|nv|n v|plc|inc|corp|corporation|co|company|ltd|limited|group|holding|holdings|class [a-c]|the)\b/g;

const normalize = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

type DirEntry = [symbol: string, name: string, market: string];

/** Listed stocks of the searchable markets, refreshed weekly (a few credits a week). */
async function stockDirectory(): Promise<DirEntry[]> {
  const cached = await cacheGet<DirEntry[]>('dir:v1', 7 * 24 * 60);
  if (cached) return cached;
  const entries: DirEntry[] = [];
  for (const market of NAME_MARKETS) {
    const body = await tdGet('stocks', market === 'US' ? { country: 'United States' } : { mic_code: market })
      .catch(() => null);
    for (const r of (body?.data ?? []) as Array<{ symbol: string; name: string; mic_code?: string }>) {
      if (market === 'US' && !US_MICS.has(r.mic_code ?? '') && r.mic_code !== 'XNGS' && r.mic_code !== 'XNMS' && r.mic_code !== 'XNCM') continue;
      entries.push([r.symbol, r.name, market]);
    }
  }
  if (entries.length) await cachePut('dir:v1', entries);
  return entries;
}

/** Company name or unknown ticker → candidate listings, best first. */
async function searchTdRef(query: string): Promise<Array<{ ref: TdRef; ticker: string }>> {
  const q = normalize(query);
  const alias = NAME_ALIASES[q];
  if (alias) {
    const ref = toTdRef(alias);
    if (ref) return [{ ref, ticker: alias }];
  }
  const appTicker = ([symbol, , market]: DirEntry) =>
    market === 'US' ? symbol.replace('.', '-') : toAppTicker(symbol, market);
  // Rank: exact name (legal form aside) > in the app's index universe > home market > prefix match > shorter
  const scored: Array<{ e: DirEntry; exact: number; known: number; prefix: number }> = [];
  for (const e of await stockDirectory()) {
    const n = normalize(e[1]);
    if (!` ${n} `.includes(` ${q} `)) continue;
    const bare = n.replace(LEGAL_FORM, ' ').replace(/\s+/g, ' ').trim();
    scored.push({ e, exact: bare === q ? 1 : 0, known: UNIVERSE.has(appTicker(e)) ? 1 : 0, prefix: n.startsWith(q) ? 1 : 0 });
  }
  scored.sort((x, y) =>
    y.exact - x.exact || y.known - x.known ||
    NAME_MARKETS.indexOf(x.e[2]) - NAME_MARKETS.indexOf(y.e[2]) ||
    y.prefix - x.prefix || x.e[1].length - y.e[1].length);
  return scored.slice(0, 3).map(({ e: [symbol, , market] }) =>
    market === 'US'
      ? { ref: { symbol, country: 'United States' }, ticker: symbol.replace('.', '-') }
      : { ref: { symbol, mic_code: market }, ticker: toAppTicker(symbol, market) });
}

// ─── Shared cache (public.market_cache, service role only) ──────────────────

let cacheDb: SupabaseClient | null | undefined;
function cache(): SupabaseClient | null {
  if (cacheDb === undefined) {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    cacheDb = url && key ? createClient(url, key) : null;
  }
  return cacheDb;
}

async function cacheGet<T>(key: string, maxAgeMin: number): Promise<T | null> {
  const db = cache();
  if (!db) return null;
  try {
    const { data } = await db.from('market_cache').select('payload, fetched_at').eq('key', key).maybeSingle();
    if (!data || Date.now() - Date.parse(data.fetched_at) > maxAgeMin * 60_000) return null;
    return data.payload as T;
  } catch {
    return null;
  }
}

async function cachePut(key: string, payload: unknown): Promise<void> {
  try {
    await cache()?.from('market_cache').upsert({ key, payload, fetched_at: new Date().toISOString() });
  } catch {
    // A missing cache only costs credits
  }
}

// ─── Weekly bars, names, quotes ─────────────────────────────────────────────

export interface WeeklyBars {
  timestamps: number[]; // unix seconds, oldest → newest
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];    // 0 when unknown
  currency: string;
  exchange: string;
  name: string | null;
  fetchedAt: string;
}

async function getName(ref: TdRef): Promise<string | null> {
  const key = `n:${refKey(ref)}`;
  const cached = await cacheGet<{ name: string | null }>(key, 30 * 24 * 60);
  if (cached) return cached.name;
  if (ref.symbol.includes('/')) return ref.symbol;
  let name: string | null = null;
  for (const path of ['stocks', 'etfs']) {
    const body = await tdGet(path, tdParams(ref)).catch(() => null);
    name = body?.data?.[0]?.name ?? null;
    if (name) break;
  }
  await cachePut(key, { name });
  return name;
}

/** Weekly OHLCV for one instrument, from the shared cache when fresh enough (1 credit otherwise). */
export async function getWeeklyBars(ref: TdRef, maxAgeMin = 30): Promise<WeeklyBars> {
  const key = `w:${refKey(ref)}`;
  const cached = await cacheGet<WeeklyBars>(key, maxAgeMin);
  if (cached) return cached;

  const body = await tdGet('time_series', { ...tdParams(ref), interval: '1week', outputsize: String(WEEKS) });
  if (body?.status !== 'ok' || !body.values?.length) {
    throw new Error(`"${ref.symbol}" sin datos en Twelve Data${body?.message ? `: ${body.message}` : ''}`);
  }
  const bars: WeeklyBars = {
    timestamps: [], closes: [], highs: [], lows: [], volumes: [],
    currency: body.meta?.currency ?? 'USD',
    exchange: body.meta?.exchange ?? '',
    name: null,
    fetchedAt: new Date().toISOString(),
  };
  // Twelve Data returns newest → oldest
  for (const v of [...body.values].reverse()) {
    const c = num(v.close);
    if (!Number.isFinite(c)) continue;
    const h = num(v.high), l = num(v.low), vol = num(v.volume ?? '0');
    bars.timestamps.push(Math.floor(Date.parse(v.datetime) / 1000));
    bars.closes.push(c);
    bars.highs.push(Number.isFinite(h) ? h : c);
    bars.lows.push(Number.isFinite(l) ? l : c);
    bars.volumes.push(Number.isFinite(vol) && vol > 0 ? vol : 0);
  }
  bars.name = await getName(ref);
  await cachePut(key, bars);
  return bars;
}

async function getQuote(ref: TdRef): Promise<TDQuote | null> {
  const q = await tdGet('quote', tdParams(ref)).catch(() => null) as TDQuote | null;
  return q && q.status !== 'error' && q.close ? q : null;
}

function num(v: string | number | undefined | null): number {
  if (v === undefined || v === null || v === '') return NaN;
  return typeof v === 'number' ? v : parseFloat(v);
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
  // Mansfield Relative Strength (Weinstein): ((ratio / SMA52_of_ratio) - 1) * 100
  // >0 = outperforming the benchmark; <0 = underperforming.
  mansfieldRS: number | null;
  mansfieldRSPrev: number | null; // value one week ago, to judge trend (rising/falling)
  mansfieldRSMA13: number | null; // 13-week SMA of the Mansfield oscillator
  mansfieldRSTrend: Trend | null;
  benchmarkSymbol: string | null;
  benchmarkName: string | null;

  // Weinstein extensions
  sma30Slope: number | null;       // % change of SMA30 over last 5 weeks
  sma30Trend: Trend | null;        // rising / falling / flat (canon: Stage 2 requires rising)
  recentSwingLow: number | null;   // lowest weekly low of the last 10 weeks
  suggestedStopLoss: number | null;
  stopLossBasis: string | null;
  stopLossRiskPct: number | null;  // distance from current price to stop (%)
  extendedStage2: boolean;         // true when price > 15% above MM30 (late Stage 2 warning)
  benchmarkStage: 'STAGE_1' | 'STAGE_2' | 'STAGE_3' | 'STAGE_4' | null;
  benchmarkStageReason: string | null;
  // Modern Weinstein multi-MA upgrade (weekly equivalents of daily MAs)
  sma10Weekly: number | null;          // ≈ SMA 50 daily  (10w × 5 trading days)
  sma40Weekly: number | null;          // ≈ SMA 200 daily (40w × 5 trading days)
  sma10WeeklyTrend: Trend | null;
  sma40WeeklyTrend: Trend | null;
  multiMaAlignment: 'bullish' | 'partial' | 'neutral' | 'bearish' | null;
  // ATR14 (weekly) — used for position sizing in next phase
  atr14Weekly: number | null;
  atr14WeeklyPct: number | null;       // ATR as % of current price
  // Volume dry-up: last 3 weeks all below 85% of 30w avg (potential breakout signal)
  volumeDryUp: boolean | null;
  // Rule-based levels: top of the Weinstein base and where to enter against it
  baseResistance: number | null;
  entryLevel: number | null;
  entryBasis: 'breakout' | 'pullback' | null;
}

interface WeeklySeries {
  timestamps: number[]; // unix seconds for each weekly candle
  closes: number[];
  highs?: number[];    // aligned with closes index
  volumes?: number[];  // aligned with closes index (0 for unknown)
}

// Mansfield RS benchmark: the index's ETF on the stock's own market (same currency
// and calendar). Index series themselves are not part of the Venture plan.
function pickBenchmark(ticker: string, currency: string): { ref: TdRef; symbol: string; name: string } {
  const u = ticker.toUpperCase();
  const etf = (symbol: string, mic: string, name: string) => ({ ref: { symbol, mic_code: mic }, symbol: `${symbol}.${MIC_SUFFIX[mic]}`, name });
  if (u.endsWith('.MC')) return etf('LYXIB', 'XMAD', 'IBEX 35');
  if (u.endsWith('.DE') || u.endsWith('.F')) return etf('EXS1', 'XETR', 'DAX');
  if (u.endsWith('.L')) return etf('ISF', 'XLON', 'FTSE 100');
  if (u.endsWith('.PA')) return etf('CAC', 'XPAR', 'CAC 40');
  if (u.endsWith('.AS')) return etf('IAEX', 'XAMS', 'AEX');
  if (u.endsWith('.BR')) return etf('BEL', 'XBRU', 'BEL 20');
  const ref = toTdRef(u);
  if (ref?.symbol.includes('/') && CRYPTO_BASE.test(ref.symbol.split('/')[0])) {
    return { ref: { symbol: 'BTC/USD' }, symbol: 'BTC/USD', name: 'Bitcoin' };
  }
  if (currency === 'EUR') return etf('EXW1', 'XETR', 'Euro Stoxx 50');
  return { ref: { symbol: 'SPY', country: 'United States' }, symbol: 'SPY', name: 'S&P 500' };
}

function weekKey(ts: number): string {
  // Bucket by ISO Monday so weekly candles from different markets align.
  const d = new Date(ts * 1000);
  const day = d.getUTCDay();
  const monday = new Date(d.getTime());
  monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

function computeMansfieldRS(
  stock: WeeklySeries,
  benchmark: WeeklySeries,
  period = 52
): { current: number | null; prev: number | null; ma13: number | null; trend: Trend | null; series: number[] } {
  const empty = { current: null, prev: null, ma13: null, trend: null, series: [] as number[] };
  if (stock.closes.length < period + 2 || benchmark.closes.length < period + 2) return empty;
  const bMap = new Map<string, number>();
  for (let i = 0; i < benchmark.timestamps.length; i++) {
    bMap.set(weekKey(benchmark.timestamps[i]), benchmark.closes[i]);
  }
  const rs: number[] = [];
  for (let i = 0; i < stock.timestamps.length; i++) {
    const b = bMap.get(weekKey(stock.timestamps[i]));
    if (b && b > 0) rs.push(stock.closes[i] / b);
  }
  if (rs.length < period + 2) return empty;
  // Build full Mansfield oscillator series.
  const series: number[] = [];
  for (let i = period; i < rs.length; i++) {
    const slice = rs.slice(i - period, i);
    const ma = slice.reduce((a, b) => a + b, 0) / period;
    series.push(ma > 0 ? ((rs[i] / ma) - 1) * 100 : 0);
  }
  const current = series[series.length - 1] ?? null;
  const prev = series[series.length - 2] ?? null;
  const ma13 = series.length >= 13
    ? series.slice(-13).reduce((a, b) => a + b, 0) / 13
    : null;
  // Weinstein: RS trend is "rising" when current > MA13 and > prev (or simply when slope-3w > 0).
  const slope3 = computeSlope(series, 3);
  const trend = classifyTrend(slope3, 0.3);
  return { current, prev, ma13, trend, series };
}

export function computeSMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function computeVolumeAvg(volumes: number[], period: number): number | null {
  const filtered = volumes.filter((v) => !Number.isNaN(v) && v > 0);
  if (filtered.length < period) return null;
  const slice = filtered.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// Rolling SMA series (length = values.length - period + 1). Used to detect slope.
export function computeSMASeries(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out.push(sum / period);
  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    out.push(sum / period);
  }
  return out;
}

export type Trend = 'rising' | 'falling' | 'flat';

// Percent change of last value vs value `lookback` steps ago.
export function computeSlope(values: number[], lookback: number): number | null {
  if (values.length < lookback + 1) return null;
  const cur = values[values.length - 1];
  const prev = values[values.length - 1 - lookback];
  if (!prev || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

export function classifyTrend(slopePct: number | null, flatBand = 0.5): Trend | null {
  if (slopePct == null) return null;
  if (slopePct > flatBand) return 'rising';
  if (slopePct < -flatBand) return 'falling';
  return 'flat';
}

// Lowest of the last `lookback` weekly lows (excluding the most recent unfinished week).
export function findRecentSwingLow(lows: number[], lookback = 10): number | null {
  if (!lows.length) return null;
  const slice = lows.slice(-Math.min(lookback, lows.length));
  const finite = slice.filter((n) => Number.isFinite(n) && n > 0);
  return finite.length ? Math.min(...finite) : null;
}

// Top of the Weinstein base: highest weekly high of the `lookback` weeks before the
// last `skipRecent`, so a fresh breakout is not mistaken for the ceiling it broke.
export function findBaseResistance(highs: number[], skipRecent = 4, lookback = 26): number | null {
  if (highs.length < skipRecent + 8) return null;
  const window = highs.slice(-(skipRecent + lookback), -skipRecent).filter((n) => Number.isFinite(n) && n > 0);
  return window.length ? Math.max(...window) : null;
}

// Below the base ceiling → enter on a breakout 1% above it. Already above it →
// Weinstein's classic entry is the pullback towards the broken resistance.
export function suggestEntry(
  currentPrice: number,
  resistance: number | null
): { level: number; basis: 'breakout' | 'pullback' } | null {
  if (resistance == null) return null;
  return currentPrice > resistance
    ? { level: resistance, basis: 'pullback' }
    : { level: resistance * 1.01, basis: 'breakout' };
}

// Weinstein-style stop: prefer the nearest swing-low below current price (with 2% buffer),
// otherwise fall back to just below MM30 (3% buffer).
export function suggestStopLoss(
  currentPrice: number,
  sma30: number | null,
  swingLow: number | null
): { level: number; basis: string; riskPct: number } | null {
  const candidates: Array<{ level: number; basis: string }> = [];
  if (swingLow && swingLow < currentPrice) {
    candidates.push({ level: swingLow * 0.98, basis: 'último swing-low (−2%)' });
  }
  if (sma30 && sma30 < currentPrice) {
    candidates.push({ level: sma30 * 0.97, basis: 'MM30 semanal (−3%)' });
  }
  if (!candidates.length) return null;
  // Use the tightest stop (closest to price) — Weinstein prefers swing-low, but
  // if MM30 sits above the swing-low we use MM30 to avoid giving back too much.
  candidates.sort((a, b) => b.level - a.level);
  const best = candidates[0];
  return {
    level: best.level,
    basis: best.basis,
    riskPct: ((currentPrice - best.level) / currentPrice) * 100,
  };
}

/** 14-period Average True Range from aligned weekly OHLC arrays. */
function computeATR(closes: number[], highs: number[], lows: number[], period = 14): number | null {
  const len = Math.min(closes.length, highs.length, lows.length);
  if (len < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < len; i++) {
    const h = highs[i], l = lows[i], pc = closes[i - 1];
    if (!Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(pc)) continue;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  if (trs.length < period) return null;
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

/** True when last 3 weekly volumes are all below 85% of the avg — signals potential breakout. */
function detectVolumeDryUp(volumes: number[], avgVol: number | null): boolean | null {
  if (!avgVol || volumes.length < 4) return null;
  const last3 = volumes.slice(-3).filter(v => v > 0);
  if (last3.length < 3) return null;
  return last3.every(v => v < avgVol * 0.85);
}

/** Multi-MA alignment based on price vs SMA10w/SMA30w/SMA40w stack and SMA40w trend. */
function computeMultiMaAlignment(
  price: number,
  sma10: number | null,
  sma30: number | null,
  sma40: number | null,
  sma40Trend: Trend | null,
): 'bullish' | 'partial' | 'neutral' | 'bearish' | null {
  if (sma10 == null || sma30 == null || sma40 == null) return null;
  const aboveSma10  = price > sma10;
  const s10OverS30  = sma10 > sma30;
  const s30OverS40  = sma30 > sma40;
  const s40Rising   = sma40Trend === 'rising';
  const s40Falling  = sma40Trend === 'falling';
  // Perfect bullish stack: price > MA10w > MA30w > MA40w AND MA40w rising
  if (aboveSma10 && s10OverS30 && s30OverS40 && s40Rising) return 'bullish';
  // Correct stack but MA40w not yet rising
  if (aboveSma10 && s10OverS30 && s30OverS40) return 'partial';
  // Price above long-term MA and trend up — partially aligned
  if (price > sma40 && s40Rising) return 'partial';
  // Full bearish stack
  if (!aboveSma10 && !s10OverS30 && !s30OverS40 && s40Falling) return 'bearish';
  return 'neutral';
}

async function attachWeinsteinExtras(
  base: TechnicalSnapshot,
  stock: WeeklySeries,
  stockLows: number[],
  smaPeriod: number
): Promise<TechnicalSnapshot> {
  // MM30 slope (% change of the SMA line over the last 5 weeks).
  const smaSeries = computeSMASeries(stock.closes, smaPeriod);
  const sma30Slope = computeSlope(smaSeries, 5);
  const sma30Trend = classifyTrend(sma30Slope, 0.5);

  // Swing-low based Weinstein stop.
  const recentSwingLow = findRecentSwingLow(stockLows, 10);
  const stop = suggestStopLoss(base.currentPrice, base.sma30Weekly, recentSwingLow);

  // Base ceiling and the entry against it.
  const baseResistance = stock.highs ? findBaseResistance(stock.highs) : null;
  const entry = suggestEntry(base.currentPrice, baseResistance);

  // Late Stage 2 warning: Weinstein recommends partial exits once price is
  // 15%+ extended above the MM30 weekly.
  const extendedStage2 = (base.distanceFromSMA30Pct ?? 0) > 15;

  // ── Multi-MA upgrade (SMA10w ≈ MA50d, SMA40w ≈ MA200d) ──────────────────
  const sma10 = computeSMA(stock.closes, 10);
  const sma40 = stock.closes.length >= 40 ? computeSMA(stock.closes, 40) : null;
  const sma10Series = computeSMASeries(stock.closes, 10);
  const sma40Series = stock.closes.length >= 40 ? computeSMASeries(stock.closes, 40) : [];
  const sma10Trend = classifyTrend(computeSlope(sma10Series, 5), 0.5);
  const sma40Trend = classifyTrend(sma40Series.length > 5 ? computeSlope(sma40Series, 5) : null, 0.5);
  const multiMaAlignment = computeMultiMaAlignment(base.currentPrice, sma10, base.sma30Weekly, sma40, sma40Trend);

  // ATR14 from weekly OHLC
  const atr14Weekly = (stock.highs && stock.highs.length >= 15)
    ? computeATR(stock.closes, stock.highs, stockLows, 14)
    : null;
  const atr14WeeklyPct = (atr14Weekly != null && base.currentPrice > 0)
    ? (atr14Weekly / base.currentPrice) * 100
    : null;

  // Volume dry-up
  const volumeDryUp = (stock.volumes && stock.volumes.length >= 4)
    ? detectVolumeDryUp(stock.volumes, base.avgVolume30Weekly)
    : null;

  // Mansfield RS + benchmark stage.
  const bench = pickBenchmark(base.symbol, base.currency);
  let benchSeries: WeeklySeries | null = null;
  try {
    const b = await getWeeklyBars(bench.ref, 6 * 60);
    benchSeries = { timestamps: b.timestamps, closes: b.closes };
  } catch (e) {
    console.warn(`[marketData] benchmark ${bench.symbol}: ${(e as Error).message}`);
  }
  let mansfield: ReturnType<typeof computeMansfieldRS> = {
    current: null, prev: null, ma13: null, trend: null, series: [],
  };
  let benchmarkStage: 'STAGE_1' | 'STAGE_2' | 'STAGE_3' | 'STAGE_4' | null = null;
  let benchmarkStageReason: string | null = null;

  if (benchSeries) {
    mansfield = computeMansfieldRS(stock, benchSeries, 52);
    const bSMA = computeSMASeries(benchSeries.closes, 30);
    const bClose = benchSeries.closes[benchSeries.closes.length - 1];
    const bSMAlast = bSMA[bSMA.length - 1] ?? null;
    const bTrend = classifyTrend(computeSlope(bSMA, 5), 0.5);
    if (bSMAlast != null && bTrend) {
      const above = bClose > bSMAlast;
      if (above && bTrend === 'rising') {
        benchmarkStage = 'STAGE_2';
        benchmarkStageReason = `${bench.name} en Etapa 2 (sobre MM30 ascendente) — contexto favorable para compras.`;
      } else if (!above && bTrend === 'falling') {
        benchmarkStage = 'STAGE_4';
        benchmarkStageReason = `${bench.name} en Etapa 4 (bajo MM30 descendente) — Weinstein: NO abrir largos.`;
      } else if (above) {
        benchmarkStage = 'STAGE_3';
        benchmarkStageReason = `${bench.name} en Etapa 3 (sobre MM30 pero aplanándose) — precaución, distribución.`;
      } else {
        benchmarkStage = 'STAGE_1';
        benchmarkStageReason = `${bench.name} en Etapa 1 (base bajo MM30) — esperar ruptura del mercado antes de comprar.`;
      }
    }
  }

  return {
    ...base,
    mansfieldRS: mansfield.current,
    mansfieldRSPrev: mansfield.prev,
    mansfieldRSMA13: mansfield.ma13,
    mansfieldRSTrend: mansfield.trend,
    benchmarkSymbol: bench.symbol,
    benchmarkName: bench.name,
    sma30Slope,
    sma30Trend,
    recentSwingLow,
    suggestedStopLoss: stop?.level ?? null,
    stopLossBasis: stop?.basis ?? null,
    stopLossRiskPct: stop?.riskPct ?? null,
    extendedStage2,
    benchmarkStage,
    benchmarkStageReason,
    sma10Weekly: sma10,
    sma40Weekly: sma40,
    sma10WeeklyTrend: sma10Trend,
    sma40WeeklyTrend: sma40Trend,
    multiMaAlignment,
    atr14Weekly,
    atr14WeeklyPct,
    volumeDryUp,
    baseResistance,
    entryLevel: entry?.level ?? null,
    entryBasis: entry?.basis ?? null,
  };
}

/** Live price for one app ticker: a quote (1 credit), else the latest cached weekly close. */
export async function getLivePrice(ticker: string): Promise<{ price: number | null; name: string; currency: string }> {
  const ref = toTdRef(ticker);
  if (!ref) throw new Error(`Ticker no reconocido: ${ticker}`);
  const q = await getQuote(ref);
  if (q) return { price: num(q.close), name: q.name ?? ticker, currency: q.currency ?? 'USD' };
  const bars = await getWeeklyBars(ref, 60);
  return { price: bars.closes.at(-1) ?? null, name: bars.name ?? ticker, currency: bars.currency };
}

export interface SnapshotOptions {
  maxAgeMin?: number;  // accept cached weekly bars up to this age (default 30)
  withQuote?: boolean; // +1 credit: live daily fields (change, day range) for single-ticker views
}

export async function getTechnicalSnapshot(
  symbol: string,
  smaPeriod = 30,
  opts: SnapshotOptions = {},
): Promise<TechnicalSnapshot> {
  let ticker = symbol.trim().toUpperCase();
  let ref = toTdRef(ticker);
  let bars: WeeklyBars | null = null;
  if (ref) {
    try {
      bars = await getWeeklyBars(ref, opts.maxAgeMin ?? 30);
    } catch (e) {
      // "APPLE", "NVIDIA": a one-word name reads like a US ticker — search it as a name
      if (ref.country !== 'United States') throw e;
      ref = null;
    }
  }
  if (!bars) {
    // A company name: first candidate listing that has data
    for (const c of await searchTdRef(symbol)) {
      try {
        bars = await getWeeklyBars(c.ref, opts.maxAgeMin ?? 30);
        ref = c.ref;
        ticker = c.ticker;
        break;
      } catch { /* try the next listing */ }
    }
    if (!bars || !ref) throw new Error(`No se encontró "${symbol}" en Twelve Data`);
  }
  if (!ref) throw new Error(`No se encontró "${symbol}" en Twelve Data`);
  const quote = opts.withQuote ? await getQuote(ref) : null;

  const closes = bars.closes;
  const highs = bars.highs;
  const lows = bars.lows;
  const volumes = bars.volumes.filter((v) => v > 0);

  const sma = closes.length ? computeSMA(closes, smaPeriod) : null;
  const volAvg = volumes.length ? computeVolumeAvg(volumes, smaPeriod) : null;
  const lastVol = volumes.length ? volumes[volumes.length - 1] : null;

  // Without a quote, the latest weekly close is the price and the change is week-on-week
  const lastClose = closes.at(-1) ?? NaN;
  const prevWeekClose = closes.at(-2) ?? NaN;
  const currentPrice = quote ? num(quote.close) : lastClose;
  const previousClose = quote ? num(quote.previous_close) : prevWeekClose;
  const change = quote ? num(quote.change) : currentPrice - previousClose;
  const changePercent = quote
    ? num(quote.percent_change)
    : Number.isFinite(previousClose) && previousClose !== 0 ? (change / previousClose) * 100 : NaN;

  const base: TechnicalSnapshot = {
    symbol: ticker,
    name: quote?.name ?? bars.name ?? ticker,
    currency: bars.currency || quote?.currency || 'USD',
    currentPrice,
    priceTimestamp: quote?.timestamp ? new Date(quote.timestamp * 1000).toISOString() : bars.fetchedAt,
    change,
    changePercent,
    dayHigh: quote ? num(quote.high) : NaN,
    dayLow: quote ? num(quote.low) : NaN,
    open: quote ? num(quote.open) : NaN,
    previousClose,
    sma30Weekly: sma,
    distanceFromSMA30Pct: sma ? ((currentPrice - sma) / sma) * 100 : null,
    avgVolume30Weekly: volAvg,
    lastWeekVolume: lastVol,
    volumeRatio: volAvg && lastVol ? lastVol / volAvg : null,
    weekly52High: highs.length ? Math.max(...highs.slice(-52)) : null,
    weekly52Low: lows.length ? Math.min(...lows.slice(-52)) : null,
    mansfieldRS: null,
    mansfieldRSPrev: null,
    mansfieldRSMA13: null,
    mansfieldRSTrend: null,
    benchmarkSymbol: null,
    benchmarkName: null,
    sma30Slope: null,
    sma30Trend: null,
    recentSwingLow: null,
    suggestedStopLoss: null,
    stopLossBasis: null,
    stopLossRiskPct: null,
    extendedStage2: false,
    benchmarkStage: null,
    benchmarkStageReason: null,
    sma10Weekly: null,
    sma40Weekly: null,
    sma10WeeklyTrend: null,
    sma40WeeklyTrend: null,
    multiMaAlignment: null,
    atr14Weekly: null,
    atr14WeeklyPct: null,
    volumeDryUp: null,
    baseResistance: null,
    entryLevel: null,
    entryBasis: null,
  };
  return await attachWeinsteinExtras(
    base,
    { timestamps: bars.timestamps, closes, highs, volumes: bars.volumes },
    lows,
    smaPeriod,
  );
}
