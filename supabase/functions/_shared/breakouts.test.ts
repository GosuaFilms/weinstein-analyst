import { assertEquals } from 'jsr:@std/assert@1';
import { detectBreakout, weekStart, distanceToEntry } from './breakouts.ts';

const base = { base_resistance: 100, sma30_trend: 'flat' };

Deno.test('a Stage 1 stock crossing above resistance +1 % is a base breakout', () => {
  const r = detectBreakout({ ...base, price: 99, stage: 'STAGE_1' }, { ...base, price: 102, stage: 'STAGE_1' });
  assertEquals(r, { kind: 'base', entry: 101 });
});

Deno.test('no breakout when it was already above, did not clear +1 %, or the MM30 falls', () => {
  assertEquals(detectBreakout({ ...base, price: 103, stage: 'STAGE_2' }, { ...base, price: 105, stage: 'STAGE_2' }), null);
  assertEquals(detectBreakout({ ...base, price: 99, stage: 'STAGE_1' }, { ...base, price: 100.5, stage: 'STAGE_1' }), null);
  assertEquals(detectBreakout({ ...base, price: 99, stage: 'STAGE_1' }, { ...base, price: 102, stage: 'STAGE_1', sma30_trend: 'falling' }), null);
  assertEquals(detectBreakout({ ...base, price: 99, stage: 'STAGE_3' }, { ...base, price: 102, stage: 'STAGE_3' }), null);
  assertEquals(detectBreakout(undefined, { ...base, price: 102, stage: 'STAGE_2' }), null);
});

Deno.test('a new high out of a Stage 2 consolidation is a continuation breakout', () => {
  const r = detectBreakout({ ...base, price: 98, stage: 'STAGE_2' }, { ...base, price: 103, stage: 'STAGE_2', sma30_trend: 'rising' });
  assertEquals(r?.kind, 'continuation');
});

Deno.test('weekStart and distanceToEntry', () => {
  assertEquals(weekStart('2026-11-27'), '2026-11-23'); // Friday → Monday
  assertEquals(weekStart('2026-11-23'), '2026-11-23');
  assertEquals(distanceToEntry(97, 100)?.toFixed(2), '4.12');
  assertEquals(distanceToEntry(102, 100), null);
});
