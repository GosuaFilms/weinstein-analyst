// Global market data client backed by TwelveData.
// Covers stocks (US + global exchanges via suffix e.g. SAN.MC, 7203.T),
// forex (EUR/USD), crypto (BTC/USD) and indices.
// Docs: https://twelvedata.com/docs
// Free tier: 800 req/day, 8 req/min.

const TD_BASE = 'https://api.twelvedata.com';

function getKey(): string {
  const key = Deno.env.get('TWELVEDATA_API_KEY');
  if (!key) throw new Error('TWELVEDATA_API_KEY not set in Edge Function secrets');
  return key;
}

interface TDQuote {
  symbol: string;
  name?: string;
  exchange?: string;
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
  fifty_two_week?: { high?: string; low?: string };
  status?: string;
  code?: number;
  message?: string;
}

interface TDTimeSeries {
  meta?: { symbol: string; currency?: string; exchange?: string };
  values?: Array<{
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume?: string;
  }>;
  status?: string;
  code?: number;
  message?: string;
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
}

interface WeeklySeries {
  timestamps: number[]; // unix seconds for each weekly candle
  closes: number[];
}

function pickBenchmark(symbol: string, currency: string): { symbol: string; name: string } {
  const u = symbol.toUpperCase();
  if (u.endsWith('.MC')) return { symbol: '^IBEX', name: 'IBEX 35' };
  if (u.endsWith('.DE') || u.endsWith('.F') || u.endsWith('.XETRA')) return { symbol: '^GDAXI', name: 'DAX' };
  if (u.endsWith('.L')) return { symbol: '^FTSE', name: 'FTSE 100' };
  if (u.endsWith('.PA')) return { symbol: '^FCHI', name: 'CAC 40' };
  if (u.endsWith('.MI')) return { symbol: 'FTSEMIB.MI', name: 'FTSE MIB' };
  if (u.endsWith('.AS')) return { symbol: '^AEX', name: 'AEX' };
  if (u.endsWith('.BR')) return { symbol: '^BFX', name: 'BEL 20' };
  if (u.endsWith('.LS')) return { symbol: 'PSI20.LS', name: 'PSI 20' };
  if (u.endsWith('.SW')) return { symbol: '^SSMI', name: 'SMI' };
  if (u.endsWith('.T') || /^\d{4}\.T$/.test(u)) return { symbol: '^N225', name: 'Nikkei 225' };
  if (u.endsWith('.HK')) return { symbol: '^HSI', name: 'Hang Seng' };
  if (u.endsWith('.AX')) return { symbol: '^AXJO', name: 'ASX 200' };
  if (u.endsWith('.TO') || u.endsWith('.V')) return { symbol: '^GSPTSE', name: 'TSX Composite' };
  if (u.endsWith('.SA')) return { symbol: '^BVSP', name: 'Bovespa' };
  if (u.endsWith('.MX')) return { symbol: '^MXX', name: 'IPC Mexico' };
  if (u.endsWith('.NS') || u.endsWith('.BO')) return { symbol: '^NSEI', name: 'NIFTY 50' };
  if (u.endsWith('-USD') || /^[A-Z]{3,5}\/USD$/.test(u)) return { symbol: 'BTC-USD', name: 'Bitcoin' };
  if (currency === 'EUR') return { symbol: '^STOXX50E', name: 'Euro Stoxx 50' };
  return { symbol: '^GSPC', name: 'S&P 500' };
}

function weekKey(ts: number): string {
  // Bucket by ISO monday so TwelveData (Mon close) and Yahoo (Sun/Mon) align.
  const d = new Date(ts * 1000);
  const day = d.getUTCDay();
  const monday = new Date(d.getTime());
  monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

async function yahooWeeklyCloses(symbol: string, weeks: number): Promise<WeeklySeries | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1wk&range=${weeks}wk`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return null;
  const body = await res.json() as {
    chart: { result?: Array<{ timestamp?: number[]; indicators: { quote: Array<{ close: Array<number | null> }> } }> };
  };
  const r = body.chart.result?.[0];
  if (!r) return null;
  const ts = r.timestamp ?? [];
  const closes = r.indicators.quote[0]?.close ?? [];
  const out: WeeklySeries = { timestamps: [], closes: [] };
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (typeof c === 'number' && !Number.isNaN(c)) {
      out.timestamps.push(ts[i]);
      out.closes.push(c);
    }
  }
  return out.closes.length ? out : null;
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

interface SymbolResolution {
  symbol: string;
  exchange?: string;
  mic_code?: string;
}

async function resolveSymbol(raw: string): Promise<SymbolResolution> {
  // Strip Yahoo-style suffix (e.g. SAN.MC, 7203.T, VOW.DE) — TwelveData uses
  // native `symbol` + `exchange`/`mic_code` instead.
  const dot = raw.lastIndexOf('.');
  const base = dot > 0 && raw.length - dot <= 4 ? raw.slice(0, dot) : raw;

  const url = `${TD_BASE}/symbol_search?symbol=${encodeURIComponent(base)}&outputsize=5&apikey=${getKey()}`;
  const res = await fetch(url);
  if (!res.ok) return { symbol: raw };
  const data = await res.json() as { data?: Array<{ symbol: string; exchange?: string; mic_code?: string; instrument_type?: string }> };
  const match = data.data?.[0];
  if (!match) return { symbol: raw };
  return { symbol: match.symbol, exchange: match.exchange, mic_code: match.mic_code };
}

async function quoteCall(params: URLSearchParams): Promise<TDQuote> {
  const res = await fetch(`${TD_BASE}/quote?${params.toString()}`);
  if (!res.ok) throw new Error(`TwelveData quote failed: ${res.status}`);
  return await res.json() as TDQuote;
}

async function fetchQuote(symbol: string): Promise<{ quote: TDQuote; resolved: SymbolResolution }> {
  // First try the raw symbol (covers AAPL, BTC/USD, EUR/USD directly).
  const p1 = new URLSearchParams({ symbol, apikey: getKey() });
  let data = await quoteCall(p1);
  if (data.status !== 'error' && data.close) {
    return { quote: data, resolved: { symbol } };
  }
  // Fallback: symbol_search to disambiguate international tickers.
  const resolved = await resolveSymbol(symbol);
  if (resolved.symbol !== symbol || resolved.mic_code || resolved.exchange) {
    const p2 = new URLSearchParams({ symbol: resolved.symbol, apikey: getKey() });
    if (resolved.mic_code) p2.set('mic_code', resolved.mic_code);
    else if (resolved.exchange) p2.set('exchange', resolved.exchange);
    data = await quoteCall(p2);
    if (data.status !== 'error' && data.close) {
      return { quote: data, resolved };
    }
  }
  throw new Error(`Ticker "${symbol}" not found on TwelveData: ${data.message ?? 'unknown'}`);
}

async function fetchWeekly(resolved: SymbolResolution, weeks: number): Promise<TDTimeSeries | null> {
  const params = new URLSearchParams({
    symbol: resolved.symbol,
    interval: '1week',
    outputsize: String(weeks),
    apikey: getKey(),
  });
  if (resolved.mic_code) params.set('mic_code', resolved.mic_code);
  else if (resolved.exchange) params.set('exchange', resolved.exchange);
  const res = await fetch(`${TD_BASE}/time_series?${params.toString()}`);
  if (!res.ok) {
    console.warn(`TwelveData time_series unavailable for ${resolved.symbol}: ${res.status}`);
    return null;
  }
  const data = await res.json() as TDTimeSeries;
  if (data.status === 'error' || !data.values?.length) {
    console.warn(`TwelveData time_series error for ${resolved.symbol}: ${data.message ?? 'empty'}`);
    return null;
  }
  return data;
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

async function yahooSearch(query: string): Promise<string | null> {
  // Resolve company names / loose input to a Yahoo ticker.
  // e.g. "Atrys" -> "ATRY.MC", "Apple" -> "AAPL", "Toyota" -> "7203.T"
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return null;
  const body = await res.json() as { quotes?: Array<{ symbol?: string; quoteType?: string; isYahooFinance?: boolean; exchange?: string; exchDisp?: string }> };
  const eligible = body.quotes?.filter((q) =>
    q.isYahooFinance && q.symbol && ['EQUITY', 'ETF', 'INDEX', 'CRYPTOCURRENCY', 'CURRENCY', 'MUTUALFUND'].includes(q.quoteType ?? '')
  ) ?? [];
  if (!eligible.length) return null;
  // Prefer primary/liquid listings. Downrank thin-mirror exchanges that Yahoo
  // sometimes returns first (Berlin, Düsseldorf, Hamburg, Munich, Stuttgart,
  // Frankfurt secondary, XETRA Dark, etc.) over the true primary listing.
  const thinSuffixes = ['.BE', '.DU', '.HM', '.MU', '.SG', '.F', '.XD', '.NE', '.VI'];
  const isThin = (s: string) => thinSuffixes.some((suf) => s.toUpperCase().endsWith(suf));
  const primary = eligible.find((q) => q.symbol && !isThin(q.symbol));
  return (primary ?? eligible[0]).symbol ?? null;
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

  // Late Stage 2 warning: Weinstein recommends partial exits once price is
  // 15%+ extended above the MM30 weekly.
  const extendedStage2 = (base.distanceFromSMA30Pct ?? 0) > 15;

  // Mansfield RS + benchmark stage.
  const bench = pickBenchmark(base.symbol, base.currency);
  const benchSeries = await yahooWeeklyCloses(bench.symbol, Math.max(stock.closes.length + 10, 120));
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
  };
}

async function yahooSnapshot(symbol: string, smaPeriod: number): Promise<TechnicalSnapshot> {
  // Yahoo Finance public chart endpoint — no API key, covers virtually every
  // exchange (Madrid .MC, Frankfurt .DE, Tokyo .T, London .L, Paris .PA,
  // HK, ASX, TSX, indices ^GSPC, etc.). Used as fallback when TwelveData
  // rejects a symbol on free tier.
  // Need ≥ 52 weeks for Mansfield RS plus ≥ 13 extra weeks for its MA13.
  // Fetch a comfortable buffer so slope/MA calculations are stable.
  const weeks = Math.max(smaPeriod + 90, 130);
  // Translate TwelveData-style symbols to Yahoo conventions:
  //   BTC/USD -> BTC-USD (crypto)
  //   EUR/USD -> EURUSD=X (forex)
  let yahooSym = symbol;
  const slash = symbol.match(/^([A-Z]{2,5})\/([A-Z]{3})$/i);
  if (slash) {
    const cryptoBase = /^(BTC|ETH|SOL|XRP|ADA|DOGE|BNB|LTC|AVAX|DOT|MATIC|LINK|ATOM|TRX|UNI|SHIB)$/i;
    yahooSym = cryptoBase.test(slash[1]) ? `${slash[1]}-${slash[2]}` : `${slash[1]}${slash[2]}=X`;
  }
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=1wk&range=${weeks}wk`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Yahoo chart failed: ${res.status}`);
  const body = await res.json() as {
    chart: {
      result?: Array<{
        meta: {
          currency?: string;
          symbol: string;
          shortName?: string;
          longName?: string;
          regularMarketPrice?: number;
          regularMarketTime?: number;
          regularMarketDayHigh?: number;
          regularMarketDayLow?: number;
          regularMarketVolume?: number;
          chartPreviousClose?: number;
          previousClose?: number;
          fiftyTwoWeekHigh?: number;
          fiftyTwoWeekLow?: number;
        };
        timestamp?: number[];
        indicators: { quote: Array<{ open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] }> };
      }>;
      error?: { description?: string } | null;
    };
  };
  const r = body.chart.result?.[0];
  if (!r) throw new Error(`Ticker "${symbol}" not found on Yahoo: ${body.chart.error?.description ?? 'unknown'}`);

  const meta = r.meta;
  const q = r.indicators.quote[0];
  const allTs = r.timestamp ?? [];
  const alignedTs: number[] = [];
  const alignedCloses: number[] = [];
  for (let i = 0; i < (q.close ?? []).length; i++) {
    const c = q.close[i];
    if (typeof c === 'number' && !Number.isNaN(c)) {
      alignedTs.push(allTs[i] ?? 0);
      alignedCloses.push(c);
    }
  }
  const closes = alignedCloses;
  const highs = (q.high ?? []).filter((n): n is number => typeof n === 'number' && !Number.isNaN(n));
  const lows = (q.low ?? []).filter((n): n is number => typeof n === 'number' && !Number.isNaN(n));
  const volumes = (q.volume ?? []).filter((n): n is number => typeof n === 'number' && !Number.isNaN(n) && n > 0);

  const sma = closes.length ? computeSMA(closes, smaPeriod) : null;
  const volAvg = volumes.length ? computeVolumeAvg(volumes, smaPeriod) : null;
  const lastVol = volumes.length ? volumes[volumes.length - 1] : null;
  const currentPrice = meta.regularMarketPrice ?? (closes.length ? closes[closes.length - 1] : NaN);
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? NaN;
  const change = Number.isNaN(prevClose) ? NaN : currentPrice - prevClose;
  const changePct = Number.isNaN(prevClose) || prevClose === 0 ? NaN : (change / prevClose) * 100;

  const base: TechnicalSnapshot = {
    symbol: meta.symbol?.toUpperCase() ?? symbol.toUpperCase(),
    name: meta.longName ?? meta.shortName ?? symbol.toUpperCase(),
    currency: meta.currency ?? 'USD',
    currentPrice,
    priceTimestamp: meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString(),
    change,
    changePercent: changePct,
    dayHigh: meta.regularMarketDayHigh ?? NaN,
    dayLow: meta.regularMarketDayLow ?? NaN,
    open: closes.length ? closes[closes.length - 1] : NaN,
    previousClose: prevClose,
    sma30Weekly: sma,
    distanceFromSMA30Pct: sma ? ((currentPrice - sma) / sma) * 100 : null,
    avgVolume30Weekly: volAvg,
    lastWeekVolume: lastVol,
    volumeRatio: volAvg && lastVol ? lastVol / volAvg : null,
    weekly52High: meta.fiftyTwoWeekHigh ?? (highs.length ? Math.max(...highs.slice(-52)) : null),
    weekly52Low: meta.fiftyTwoWeekLow ?? (lows.length ? Math.min(...lows.slice(-52)) : null),
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
  };
  return await attachWeinsteinExtras(base, { timestamps: alignedTs, closes: alignedCloses }, lows, smaPeriod);
}

export async function getTechnicalSnapshot(
  symbol: string,
  smaPeriod = 30
): Promise<TechnicalSnapshot> {
  let quote: TDQuote;
  let resolved: SymbolResolution;
  try {
    const r = await fetchQuote(symbol);
    quote = r.quote;
    resolved = r.resolved;
  } catch (err) {
    const msg = (err as Error).message;
    console.warn(`TwelveData failed for ${symbol} (${msg}). Falling back to Yahoo.`);
    try {
      return await yahooSnapshot(symbol, smaPeriod);
    } catch (yahooErr) {
      // Last resort: resolve company name / loose input via Yahoo search.
      const resolvedSymbol = await yahooSearch(symbol);
      if (!resolvedSymbol || resolvedSymbol === symbol) throw yahooErr;
      console.warn(`Yahoo search resolved "${symbol}" -> "${resolvedSymbol}".`);
      return await yahooSnapshot(resolvedSymbol, smaPeriod);
    }
  }
  const series = await fetchWeekly(resolved, Math.max(smaPeriod + 90, 130));

  // TwelveData returns time_series newest -> oldest. Reverse to oldest -> newest.
  const candles = series?.values ? [...series.values].reverse() : null;
  const stockTs: number[] = [];
  const closes: number[] = [];
  if (candles) {
    for (const v of candles) {
      const c = num(v.close);
      if (!Number.isNaN(c)) {
        stockTs.push(Math.floor(new Date(v.datetime).getTime() / 1000));
        closes.push(c);
      }
    }
  }
  const highs = candles?.map((v) => num(v.high)).filter((n) => !Number.isNaN(n)) ?? [];
  const lows = candles?.map((v) => num(v.low)).filter((n) => !Number.isNaN(n)) ?? [];
  const volumes = candles?.map((v) => num(v.volume ?? '0')) ?? [];

  const sma = closes.length ? computeSMA(closes, smaPeriod) : null;
  const volAvg = volumes.length ? computeVolumeAvg(volumes, smaPeriod) : null;
  const lastVol = volumes.length ? volumes[volumes.length - 1] : null;
  const lastValidVol = lastVol && !Number.isNaN(lastVol) && lastVol > 0 ? lastVol : null;

  const currentPrice = num(quote.close);
  const priceTs = quote.timestamp
    ? new Date(quote.timestamp * 1000).toISOString()
    : quote.datetime
    ? new Date(quote.datetime).toISOString()
    : new Date().toISOString();

  const base: TechnicalSnapshot = {
    symbol: (resolved.symbol ?? symbol).toUpperCase(),
    name: quote.name ?? symbol.toUpperCase(),
    currency: quote.currency ?? series?.meta?.currency ?? 'USD',
    currentPrice,
    priceTimestamp: priceTs,
    change: num(quote.change),
    changePercent: num(quote.percent_change),
    dayHigh: num(quote.high),
    dayLow: num(quote.low),
    open: num(quote.open),
    previousClose: num(quote.previous_close),
    sma30Weekly: sma,
    distanceFromSMA30Pct: sma ? ((currentPrice - sma) / sma) * 100 : null,
    avgVolume30Weekly: volAvg,
    lastWeekVolume: lastValidVol,
    volumeRatio: volAvg && lastValidVol ? lastValidVol / volAvg : null,
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
  };
  return await attachWeinsteinExtras(base, { timestamps: stockTs, closes }, lows, smaPeriod);
}
