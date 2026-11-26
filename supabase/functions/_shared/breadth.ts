// Market breadth (the "thermometer"): what share of an index's stocks is above
// its 30-week MA, and above a rising one, week by week — rebuilt from the weekly
// charts kept for the public stock pages.

import type { WeeklyChart } from './marketData.ts';

export interface BreadthStock {
  index_ids: string[];
  stage: string;
  benchmark: string | null;
  benchmark_stage: string | null;
  chart: WeeklyChart | null;
}

export interface BreadthRow {
  index_id: string;
  n: number;
  counts: Record<string, number>;
  pct_above: number | null;
  pct_uptrend: number | null;  // equals the classifier's Stage 2 rule (above a rising MM30) on weekly closes
  pct_stage2: number | null;
  index_stage: string | null;
  benchmark: string | null;
  series: { t: number[]; above: number[]; up: number[] };
}

const SLOPE_WEEKS = 5;
const FLAT_BAND = 0.5;  // same rule as sma30Trend: rising when the MM30 gained > 0.5 % in 5 weeks
const MIN_COVERAGE = 0.6; // a week counts only when most of the index has data for it

/** Monday 00:00 UTC of the candle's week, so EU and US candles line up. */
export function weekKey(ts: number): number {
  const d = new Date(ts * 1000);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day) / 1000;
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/** The value shared by at least 90 % of the list (null when mixed, e.g. Euro Stoxx 50 members
 *  are measured against their national index, so it has no single benchmark). */
function shared(values: (string | null)[]): string | null {
  const c = new Map<string, number>();
  for (const v of values) if (v) c.set(v, (c.get(v) ?? 0) + 1);
  for (const [k, v] of c) if (v >= values.length * 0.9) return k;
  return null;
}

export function computeBreadth(indexId: string, stocks: BreadthStock[]): BreadthRow {
  const counts: Record<string, number> = { STAGE_1: 0, STAGE_2: 0, STAGE_3: 0, STAGE_4: 0 };
  for (const s of stocks) counts[s.stage] = (counts[s.stage] ?? 0) + 1;

  // week → [stocks with data, above MM30, above a rising MM30]
  const weeks = new Map<number, [number, number, number]>();
  for (const s of stocks) {
    const ch = s.chart;
    if (!ch) continue;
    for (let i = SLOPE_WEEKS; i < ch.c.length; i++) {
      const ma = ch.ma[i], prev = ch.ma[i - SLOPE_WEEKS];
      if (ma == null || prev == null || prev === 0) continue;
      const k = weekKey(ch.t[i]);
      const w = weeks.get(k) ?? [0, 0, 0];
      const above = ch.c[i] > ma;
      w[0]++;
      if (above) w[1]++;
      if (above && ((ma - prev) / prev) * 100 > FLAT_BAND) w[2]++;
      weeks.set(k, w);
    }
  }
  const withCharts = stocks.filter((s) => s.chart).length;
  const series = { t: [] as number[], above: [] as number[], up: [] as number[] };
  for (const k of [...weeks.keys()].sort((a, b) => a - b)) {
    const [n, a, u] = weeks.get(k)!;
    if (n < Math.max(1, withCharts * MIN_COVERAGE)) continue;
    series.t.push(k);
    series.above.push(pct(a, n)!);
    series.up.push(pct(u, n)!);
  }

  return {
    index_id: indexId,
    n: stocks.length,
    counts,
    pct_above: series.above.at(-1) ?? null,
    pct_uptrend: series.up.at(-1) ?? null,
    pct_stage2: pct(counts.STAGE_2, stocks.length),
    // The index's own stage: its members' common benchmark (stage taken with that benchmark)
    benchmark: indexId === 'ALL' ? null : shared(stocks.map((s) => s.benchmark)),
    index_stage: indexId === 'ALL' || !shared(stocks.map((s) => s.benchmark)) ? null : shared(stocks.map((s) => s.benchmark_stage)),
    series,
  };
}

/** One row per index the stocks belong to, plus 'ALL' (each stock once). */
export function breadthByIndex(stocks: BreadthStock[]): BreadthRow[] {
  const ids = [...new Set(stocks.flatMap((s) => s.index_ids))];
  return [
    ...ids.map((id) => computeBreadth(id, stocks.filter((s) => s.index_ids.includes(id)))),
    computeBreadth('ALL', stocks),
  ];
}
