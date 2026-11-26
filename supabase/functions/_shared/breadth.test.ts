import { assertEquals } from 'jsr:@std/assert@1';
import { computeBreadth, weekKey, breadthByIndex, type BreadthStock } from './breadth.ts';

const WEEK = 7 * 86400;
const MON = Date.UTC(2026, 9, 5) / 1000; // Monday 5 Oct 2026

function stock(closes: number[], ma: number[], idx = ['IBEX35'], stage = 'STAGE_2', shiftDays = 0): BreadthStock {
  return {
    index_ids: idx, stage, benchmark: 'IBEX 35', benchmark_stage: 'STAGE_1',
    chart: { t: closes.map((_, i) => MON + i * WEEK + shiftDays * 86400), c: closes, ma },
  };
}

Deno.test('weekKey maps any weekday to its Monday', () => {
  assertEquals(weekKey(MON + 4 * 86400 + 3600), MON); // Friday
  assertEquals(weekKey(MON), MON);
});

Deno.test('breadth counts above and above-a-rising-MM30 per week', () => {
  // A: above a rising MA every week; B: above a flat MA; C: below
  const rising = [100, 101, 102, 103, 104, 105, 106, 107];
  const flat = [100, 100, 100, 100, 100, 100, 100, 100];
  const a = stock(rising.map((v) => v + 5), rising);
  const b = stock(flat.map((v) => v + 5), flat, ['IBEX35'], 'STAGE_1', 4); // Friday candles still line up
  const c = stock(flat.map((v) => v - 5), flat, ['IBEX35'], 'STAGE_4');
  const r = computeBreadth('IBEX35', [a, b, c]);
  assertEquals(r.series.t.length, 3);          // weeks 5..7 (5-week slope needs history)
  assertEquals(r.pct_above, 66.7);             // A and B
  assertEquals(r.pct_uptrend, 33.3);           // only A has a rising MA
  assertEquals(r.counts, { STAGE_1: 1, STAGE_2: 1, STAGE_3: 0, STAGE_4: 1 });
  assertEquals(r.pct_stage2, 33.3);
  assertEquals(r.index_stage, 'STAGE_1');
});

Deno.test('breadthByIndex adds ALL with each stock once', () => {
  const ma = [100, 100, 100, 100, 100, 100, 100];
  const rows = breadthByIndex([stock(ma.map((v) => v + 1), ma, ['CAC40', 'EUROSTOXX50']), stock(ma.map((v) => v - 1), ma, ['CAC40'])]);
  const all = rows.find((r) => r.index_id === 'ALL')!;
  assertEquals(all.n, 2);
  assertEquals(rows.find((r) => r.index_id === 'EUROSTOXX50')!.n, 1);
  assertEquals(all.index_stage, null);
});
