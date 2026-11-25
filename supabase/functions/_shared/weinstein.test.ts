// deno test supabase/functions/_shared/weinstein.test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { classifyStage } from './weinstein.ts';
import { computeMansfieldRS, isWeekInProgress, type TechnicalSnapshot } from './marketData.ts';

const snap = (o: Partial<TechnicalSnapshot>): TechnicalSnapshot => ({
  symbol: 'TEST', name: 'Test', currency: 'USD', currentPrice: 100, priceTimestamp: '', marketOpen: null,
  change: 0, changePercent: 0, dayHigh: NaN, dayLow: NaN, open: NaN, previousClose: 100,
  sma30Weekly: 100, distanceFromSMA30Pct: 0, avgVolume30Weekly: null, lastWeekVolume: null, volumeRatio: null,
  weekly52High: 120, weekly52Low: 80, mansfieldRS: 0, mansfieldRSPrev: null, mansfieldRSMA13: null,
  mansfieldRSTrend: 'flat', benchmarkSymbol: null, benchmarkName: null, sma30Slope: 0, sma30Trend: 'flat',
  recentSwingLow: null, suggestedStopLoss: null, stopLossBasis: null, stopLossRiskPct: null, extendedStage2: false,
  priorTrend: 'sideways', priorTrendPct: 0, weekInProgress: false, benchmarkStage: null, benchmarkStageReason: null,
  sma10Weekly: null, sma40Weekly: null, sma10WeeklyTrend: null, sma40WeeklyTrend: null, multiMaAlignment: null,
  atr14Weekly: null, atr14WeeklyPct: null, volumeDryUp: null, baseResistance: null, entryLevel: null, entryBasis: null,
  ...o,
});

Deno.test('above a flat MM30 after a decline is a base (Stage 1), not a top', () => {
  const s = snap({ currentPrice: 103, distanceFromSMA30Pct: 3, sma30Trend: 'flat', priorTrend: 'decline', priorTrendPct: -18 });
  assertEquals(classifyStage(s).stage, 'STAGE_1');
});

Deno.test('above a flat MM30 after an advance is a top (Stage 3)', () => {
  const s = snap({ currentPrice: 103, distanceFromSMA30Pct: 3, sma30Trend: 'flat', priorTrend: 'advance', priorTrendPct: 25 });
  assertEquals(classifyStage(s).stage, 'STAGE_3');
});

Deno.test('below a still-rising MM30 after an advance is a top warning (Stage 3), not a base', () => {
  const s = snap({ currentPrice: 96, distanceFromSMA30Pct: -4, sma30Trend: 'rising', priorTrend: 'advance', priorTrendPct: 30 });
  assertEquals(classifyStage(s).stage, 'STAGE_3');
});

Deno.test('below an MM30 turning up after a decline is a maturing base (Stage 1)', () => {
  const s = snap({ currentPrice: 97, distanceFromSMA30Pct: -3, sma30Trend: 'rising', priorTrend: 'decline', priorTrendPct: -12 });
  assertEquals(classifyStage(s).stage, 'STAGE_1');
});

Deno.test('Stage 2 and Stage 4 are unchanged', () => {
  assertEquals(classifyStage(snap({ currentPrice: 110, distanceFromSMA30Pct: 10, sma30Trend: 'rising', priorTrend: 'decline' })).stage, 'STAGE_2');
  assertEquals(classifyStage(snap({ currentPrice: 90, distanceFromSMA30Pct: -10, sma30Trend: 'falling', priorTrend: 'advance' })).stage, 'STAGE_4');
});

Deno.test('Mansfield RS improving from negative values is "rising"', () => {
  // Stock underperforms for a year, then recovers part of it in the last weeks
  const n = 70;
  const timestamps = Array.from({ length: n }, (_, i) => Date.UTC(2025, 0, 6 + i * 7) / 1000);
  const bench = timestamps.map(() => 100);
  const stock = timestamps.map((_, i) => (i < 60 ? 100 - i * 0.5 : 70 + (i - 60) * 0.6));
  const rs = computeMansfieldRS({ timestamps, closes: stock }, { timestamps, closes: bench }, 52);
  assertEquals((rs.current ?? 0) < 0, true);
  assertEquals(rs.trend, 'rising');
});

Deno.test('the current week is in progress until Friday 21:00 UTC', () => {
  const monday = Date.UTC(2026, 10, 23) / 1000; // Mon 23 Nov 2026
  assertEquals(isWeekInProgress(monday, new Date(Date.UTC(2026, 10, 25, 22))), true);  // Wed
  assertEquals(isWeekInProgress(monday, new Date(Date.UTC(2026, 10, 27, 20))), true);  // Fri before close
  assertEquals(isWeekInProgress(monday, new Date(Date.UTC(2026, 10, 27, 22))), false); // Fri after close
  assertEquals(isWeekInProgress(monday, new Date(Date.UTC(2026, 10, 30, 9))), false);  // next Monday
});
