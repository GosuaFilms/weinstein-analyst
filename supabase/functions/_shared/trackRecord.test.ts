// deno test --allow-env supabase/functions/_shared/trackRecord.test.ts
// (no network: benchmark prices come back null, which these rules don't need)
import { assertEquals } from 'jsr:@std/assert@1';
import { stepTrackRecord, type ScanRow, type TrackSignal } from './trackRecord.ts';

const row = (symbol: string, o: Partial<ScanRow> = {}): ScanRow => ({
  symbol, name: symbol, index_id: 'SP100', currency: 'USD', current_price: 100, confidence: 'medium',
  stop_loss: 90, distance_pct: 5, mansfield_rs: 3, extended: false, volume_ratio: 1.2, benchmark_stage: 'STAGE_2', ...o,
});

async function enter(date: string, rows: ScanRow[], prevFriday: { date: string; symbols: Set<string> } | null, prevSymbols = new Set<string>()) {
  const signals: TrackSignal[] = [];
  await stepTrackRecord(signals, {
    date, prevDate: '2026-12-03', stage2: rows, prevSymbols, prevFriday,
    scannedIndices: new Set(['SP100']), priceOn: async () => 100, dailyStopCheck: false,
  });
  return signals.map((s) => s.symbol).sort();
}

const lastFriday = { date: '2026-11-27', symbols: new Set(['OLD']) };

Deno.test('Friday: new in Stage 2 vs last Friday, RS > 0, market not in Stage 4, not extended → signal', async () => {
  const got = await enter('2026-12-04', [
    row('OK'),
    row('OLD'),                                   // already in Stage 2 last Friday
    row('WEAKRS', { mansfield_rs: -1 }),          // negative RS
    row('BEAR', { benchmark_stage: 'STAGE_4' }),  // market in Stage 4
    row('EXT', { extended: true }),               // too far above the MM30
  ], lastFriday);
  assertEquals(got, ['OK']);
});

Deno.test('volume is recorded, not required', async () => {
  const signals: TrackSignal[] = [];
  await stepTrackRecord(signals, {
    date: '2026-12-04', prevDate: '2026-12-03', stage2: [row('LOWVOL', { volume_ratio: 0.6 })], prevSymbols: new Set(),
    prevFriday: lastFriday, scannedIndices: new Set(['SP100']), priceOn: async () => 100, dailyStopCheck: false,
  });
  assertEquals(signals.length, 1);
  assertEquals(signals[0].volume_ratio, 0.6);
});

Deno.test('no entries on weekdays other than Friday', async () => {
  assertEquals(await enter('2026-12-03', [row('OK')], lastFriday), []);
});

Deno.test('no entries when the previous Friday scan is missing or weeks old', async () => {
  assertEquals(await enter('2026-12-04', [row('OK')], null), []);
  assertEquals(await enter('2026-11-27', [row('OK')], { date: '2026-10-30', symbols: new Set() }), []);
});

Deno.test('before 27 Nov 2026 the old daily rule still applies (RS not checked)', async () => {
  const got = await enter('2026-11-26', [row('WEAKRS', { mansfield_rs: -1 })], null, new Set());
  assertEquals(got, ['WEAKRS']);
});
