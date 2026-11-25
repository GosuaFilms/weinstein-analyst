// Automatic, rule-based track record built from the daily Stage 2 scan.
//
// Rules (shown verbatim on /resultados, keep them in sync):
//  • Entry: a stock appears in Stage 2 on a scan when it wasn't on the previous
//    scan, and it is not extended (> 15 % over its MM30). Entry = that day's close.
//    Entries are only taken when the previous scan is ≤ MAX_GAP_DAYS old — after
//    a hole in the data we can't tell when the stock really entered.
//  • Exit: the first daily close at or below the initial stop, or the first scan
//    on which the stock is no longer in Stage 2 (exit = that day's close).
//  • Each signal is measured against its market's index ETF over the same days.
//  • No commissions, slippage or dividends.

import { getDailyCloses, pickBenchmark, toTdRef, type TdRef } from './marketData.ts';

export const MAX_GAP_DAYS = 5;

export interface ScanRow {
  symbol: string;
  name: string;
  index_id: string;
  currency: string | null;
  current_price: number | null;
  confidence: string | null;
  stop_loss: number | null;
  distance_pct: number | null;
  mansfield_rs: number | null;
  extended: boolean | null;
}

export interface TrackSignal {
  id?: number;
  symbol: string;
  name: string;
  index_id: string;
  currency: string | null;
  confidence: string | null;
  entry_date: string;
  entry_price: number;
  stop_loss: number | null;
  distance_pct: number | null;
  mansfield_rs: number | null;
  benchmark_symbol: string | null;
  benchmark_entry: number | null;
  status: 'open' | 'closed';
  exit_date: string | null;
  exit_price: number | null;
  exit_reason: 'stage_exit' | 'stop' | null;
  benchmark_exit: number | null;
  last_date: string | null;
  last_price: number | null;
  benchmark_last: number | null;
  data_gap: boolean;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/** Close on `date`, or the last one before it (holidays, different calendars). */
export function closeOn(closes: Record<string, number> | null, date: string): number | null {
  if (!closes) return null;
  let best: string | null = null;
  for (const d of Object.keys(closes)) if (d <= date && (!best || d > best)) best = d;
  return best ? closes[best] : null;
}

// One fetch per instrument per run
const dailyMemo = new Map<string, Promise<Record<string, number> | null>>();
export function dailyClosesFor(ref: TdRef | null): Promise<Record<string, number> | null> {
  if (!ref) return Promise.resolve(null);
  const key = JSON.stringify(ref);
  let p = dailyMemo.get(key);
  if (!p) {
    p = getDailyCloses(ref, 90).catch((e) => {
      console.warn(`[trackRecord] daily closes ${ref.symbol}: ${(e as Error).message}`);
      return null;
    });
    dailyMemo.set(key, p);
  }
  return p;
}

const stockCloses = (symbol: string) => dailyClosesFor(toTdRef(symbol));

async function benchmarkOn(symbol: string, currency: string | null, date: string) {
  const b = pickBenchmark(symbol, currency ?? '');
  return { symbol: b.symbol, price: closeOn(await dailyClosesFor(b.ref), date) };
}

export interface StepInput {
  date: string;
  prevDate: string | null;
  /** Stage 2 rows on `date` (any index; duplicates across indices are fine). */
  stage2: ScanRow[];
  /** Symbols in Stage 2 on prevDate. */
  prevSymbols: Set<string>;
  /** Indices that actually produced results on `date`: a failed index says nothing about its stocks. */
  scannedIndices: Set<string>;
  /** Price of any symbol on `date`; null = unknown (keep the signal as it is). */
  priceOn: (symbol: string) => Promise<number | null>;
  /** Check stops against every daily close since the last check (backfill, or after a data hole). */
  dailyStopCheck: boolean;
}

/** Advances the signals one scan day. Mutates and returns `signals` (open + newly opened/closed). */
export async function stepTrackRecord(signals: TrackSignal[], input: StepInput): Promise<{ opened: number; closed: number }> {
  const { date, prevDate } = input;
  const gap = !prevDate || daysBetween(prevDate, date) > MAX_GAP_DAYS;
  const today = new Map<string, ScanRow>();
  for (const r of input.stage2) if (!today.has(r.symbol)) today.set(r.symbol, r);

  let opened = 0, closed = 0;
  const openSymbols = new Set<string>();

  for (const s of signals) {
    if (s.status !== 'open') continue;
    if (s.entry_date >= date) { openSymbols.add(s.symbol); continue; }
    const since = s.last_date ?? s.entry_date;

    let exit: { date: string; price: number; reason: 'stage_exit' | 'stop'; gap: boolean } | null = null;

    if (s.stop_loss != null) {
      if (input.dailyStopCheck || gap) {
        const closes = await stockCloses(s.symbol);
        if (closes) {
          for (const d of Object.keys(closes).sort()) {
            if (d > since && d <= date && closes[d] <= s.stop_loss) {
              exit = { date: d, price: closes[d], reason: 'stop', gap: false };
              break;
            }
          }
        }
      } else {
        const p = await input.priceOn(s.symbol);
        if (p != null && p <= s.stop_loss) exit = { date, price: p, reason: 'stop', gap: false };
      }
    }

    const price = await input.priceOn(s.symbol);
    if (!exit) {
      if (price == null || !input.scannedIndices.has(s.index_id)) { openSymbols.add(s.symbol); continue; }
      if (!today.has(s.symbol)) exit = { date, price, reason: 'stage_exit', gap };
    }

    if (exit) {
      const bench = await benchmarkOn(s.symbol, s.currency, exit.date);
      Object.assign(s, {
        status: 'closed', exit_date: exit.date, exit_price: exit.price, exit_reason: exit.reason,
        benchmark_exit: bench.price, last_date: exit.date, last_price: exit.price, benchmark_last: bench.price,
        data_gap: s.data_gap || exit.gap,
      });
      closed++;
    } else {
      const bench = await benchmarkOn(s.symbol, s.currency, date);
      Object.assign(s, { last_date: date, last_price: price, benchmark_last: bench.price ?? s.benchmark_last });
      openSymbols.add(s.symbol);
    }
  }

  if (!gap) {
    for (const r of today.values()) {
      if (input.prevSymbols.has(r.symbol) || openSymbols.has(r.symbol)) continue;
      if (r.extended || r.current_price == null || r.current_price <= 0) continue;
      if (signals.some((s) => s.symbol === r.symbol && s.entry_date === date)) continue;
      const bench = await benchmarkOn(r.symbol, r.currency, date);
      signals.push({
        symbol: r.symbol, name: r.name, index_id: r.index_id, currency: r.currency, confidence: r.confidence,
        entry_date: date, entry_price: r.current_price, stop_loss: r.stop_loss,
        distance_pct: r.distance_pct, mansfield_rs: r.mansfield_rs,
        benchmark_symbol: bench.symbol, benchmark_entry: bench.price,
        status: 'open', exit_date: null, exit_price: null, exit_reason: null, benchmark_exit: null,
        last_date: date, last_price: r.current_price, benchmark_last: bench.price, data_gap: false,
      });
      openSymbols.add(r.symbol);
      opened++;
    }
  }
  return { opened, closed };
}

const COLUMNS = [
  'symbol', 'name', 'index_id', 'currency', 'confidence', 'entry_date', 'entry_price', 'stop_loss',
  'distance_pct', 'mansfield_rs', 'benchmark_symbol', 'benchmark_entry', 'status', 'exit_date',
  'exit_price', 'exit_reason', 'benchmark_exit', 'last_date', 'last_price', 'benchmark_last', 'data_gap',
] as const;

/** Writes signals back: updates by id, inserts the new ones. */
// deno-lint-ignore no-explicit-any
export async function saveSignals(db: any, signals: TrackSignal[]): Promise<void> {
  const pick = (s: TrackSignal) => Object.fromEntries(COLUMNS.map((c) => [c, s[c]]));
  const existing = signals.filter((s) => s.id != null).map((s) => ({ id: s.id, ...pick(s) }));
  const fresh = signals.filter((s) => s.id == null).map(pick);
  // Close before inserting so the "one open signal per symbol" index never collides
  for (let i = 0; i < existing.length; i += 200) {
    const { error } = await db.from('track_signals').upsert(existing.slice(i, i + 200), { onConflict: 'id' });
    if (error) throw new Error(`track_signals update: ${error.message}`);
  }
  for (let i = 0; i < fresh.length; i += 200) {
    const { error } = await db.from('track_signals').insert(fresh.slice(i, i + 200));
    if (error) throw new Error(`track_signals insert: ${error.message}`);
  }
}

/** Daily close of an app ticker on a date (backfill). */
export async function symbolCloseOn(symbol: string, date: string): Promise<number | null> {
  return closeOn(await stockCloses(symbol), date);
}
