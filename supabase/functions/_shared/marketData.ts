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
    console.warn(`TwelveData time_series unavailable for ${symbol}: ${res.status}`);
    return null;
  }
  const data = await res.json() as TDTimeSeries;
  if (data.status === 'error' || !data.values?.length) {
    console.warn(`TwelveData time_series error for ${symbol}: ${data.message ?? 'empty'}`);
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

async function yahooSearch(query: string): Promise<string | null> {
  // Resolve company names / loose input to a Yahoo ticker.
  // e.g. "Atrys" -> "ATRY.MC", "Apple" -> "AAPL", "Toyota" -> "7203.T"
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=5&newsCount=0`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return null;
  const body = await res.json() as { quotes?: Array<{ symbol?: string; quoteType?: string; isYahooFinance?: boolean }> };
  const hit = body.quotes?.find((q) => q.isYahooFinance && q.symbol && ['EQUITY', 'ETF', 'INDEX', 'CRYPTOCURRENCY', 'CURRENCY', 'MUTUALFUND'].includes(q.quoteType ?? ''));
  return hit?.symbol ?? null;
}

async function yahooSnapshot(symbol: string, smaPeriod: number): Promise<TechnicalSnapshot> {
  // Yahoo Finance public chart endpoint — no API key, covers virtually every
  // exchange (Madrid .MC, Frankfurt .DE, Tokyo .T, London .L, Paris .PA,
  // HK, ASX, TSX, indices ^GSPC, etc.). Used as fallback when TwelveData
  // rejects a symbol on free tier.
  const weeks = Math.max(smaPeriod + 30, 60);
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
  const closes = (q.close ?? []).filter((n): n is number => typeof n === 'number' && !Number.isNaN(n));
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

  return {
    symbol: symbol.toUpperCase(),
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
  };
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
  const series = await fetchWeekly(resolved, Math.max(smaPeriod + 30, 60));

  // TwelveData returns time_series newest -> oldest. Reverse to oldest -> newest.
  const candles = series?.values ? [...series.values].reverse() : null;
  const closes = candles?.map((v) => num(v.close)).filter((n) => !Number.isNaN(n)) ?? [];
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

  return {
    symbol: symbol.toUpperCase(),
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
  };
}
