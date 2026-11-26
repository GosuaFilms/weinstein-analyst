// Weinstein's buy point: the price breaks above the top of its base (resistance)
// while the 30-week MA is no longer falling. Detected on the daily scan by
// comparing each stock with its previous scan; confirmed with the weekly close
// and the week's volume (ideally 2× its average); failed if it falls back into
// the base.

export const ENTRY_BUFFER = 1.01;     // entry 1 % above the resistance (same as suggestEntry)
export const FAIL_BUFFER = 0.98;      // back 2 % under the resistance = failed breakout
export const NEAR_PCT = 5;            // "close to breaking": within 5 % under the entry level
export const STRONG_VOLUME = 2;       // Weinstein's breakout volume

export interface ScanState {
  price: number | null;
  base_resistance: number | null;
  stage: string;
  sma30_trend?: string | null;
}

export type BreakoutKind = 'base' | 'continuation';

/** A breakout between two consecutive scans, or null. */
export function detectBreakout(prev: ScanState | undefined, cur: ScanState): { kind: BreakoutKind; entry: number } | null {
  if (!prev || prev.price == null || prev.base_resistance == null) return null;
  if (cur.price == null || cur.base_resistance == null) return null;
  if (!['STAGE_1', 'STAGE_2'].includes(cur.stage)) return null;
  if (cur.sma30_trend === 'falling') return null;
  const prevEntry = prev.base_resistance * ENTRY_BUFFER;
  const entry = cur.base_resistance * ENTRY_BUFFER;
  if (prev.price > prevEntry || cur.price <= entry) return null;
  // Out of a base (Stage 1, or a stock that wasn't in Stage 2 yesterday) vs a new
  // high after a consolidation inside Stage 2 (Weinstein's continuation buy)
  return { kind: prev.stage === 'STAGE_2' ? 'continuation' : 'base', entry: Math.round(entry * 1e4) / 1e4 };
}

/** Monday (YYYY-MM-DD) of the date's week: one breakout per stock and week. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** % the price still has to climb to reach the entry level (null when above it). */
export function distanceToEntry(price: number | null, resistance: number | null): number | null {
  if (price == null || resistance == null || price <= 0) return null;
  const entry = resistance * ENTRY_BUFFER;
  return price >= entry ? null : ((entry - price) / price) * 100;
}
