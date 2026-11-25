// POST /functions/v1/sector-ranking
// Weekdays 22:15 UTC via pg_cron (after the Stage 2 scan). Classifies the 27 sector
// ETFs (11 US, 16 STOXX Europe 600) with the same Weinstein rules as stocks, with
// Mansfield RS against S&P 500 / STOXX 600, ranks them per region (Stage 2 first,
// then Stage 1, 3, 4; within a stage by RS) and stores the day in sector_ranking.
//
// Auth: x-cron-secret. Body: {} → run · { action: 'map', symbols } → sector of each
// ticker (read-only) · { action: 'probe', path, symbols } → raw Twelve Data check.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getTechnicalSnapshot, tdRequest, toTdRef } from '../_shared/marketData.ts';
import { classifyStage } from '../_shared/weinstein.ts';
import { SECTORS, REGION_BENCHMARK, sectorEtfOf, sectorByEtf } from '../_shared/sectors.ts';

const STAGE_ORDER: Record<string, number> = { STAGE_2: 0, STAGE_1: 1, STAGE_3: 2, STAGE_4: 3 };

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) return jsonResponse({ error: 'forbidden' }, 403);
  const body = await req.json().catch(() => ({})) as { action?: string; symbols?: string[]; path?: string };

  if (body.action === 'probe') {
    const out: Record<string, unknown> = {};
    for (const s of body.symbols ?? []) {
      const ref = toTdRef(s);
      out[s] = ref ? await tdRequest(body.path ?? 'quote', ref).catch((e) => String(e)) : 'bad ticker';
    }
    return jsonResponse(out);
  }

  if (body.action === 'map') {
    const out: Record<string, string | null> = {};
    for (const s of body.symbols ?? []) {
      const etf = await sectorEtfOf(s);
      out[s] = etf ? `${etf} ${sectorByEtf.get(etf)?.es}` : null;
    }
    return jsonResponse(out);
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const today = new Date().toISOString().slice(0, 10);

  const results = await Promise.all(SECTORS.map(async (sec) => {
    try {
      const snap = await getTechnicalSnapshot(sec.etf, 30, { benchmark: REGION_BENCHMARK[sec.region] });
      const cls = classifyStage(snap);
      return {
        scan_date: today, etf: sec.etf, region: sec.region, name_es: sec.es, name_en: sec.en,
        stage: cls.stage, confidence: cls.confidence, rs: snap.mansfieldRS, rs_trend: snap.mansfieldRSTrend,
        dist_pct: snap.distanceFromSMA30Pct, sma_trend: snap.sma30Trend, price: snap.currentPrice, rank: 0,
      };
    } catch (e) {
      console.warn(`[sector-ranking] ${sec.etf}: ${(e as Error).message}`);
      return null;
    }
  }));
  const rows = results.filter((r): r is NonNullable<typeof r> => r !== null);

  for (const region of ['US', 'EU'] as const) {
    rows.filter((r) => r.region === region)
      .sort((a, b) => (STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]) || ((b.rs ?? -Infinity) - (a.rs ?? -Infinity)))
      .forEach((r, i) => { r.rank = i + 1; });
  }

  if (rows.length) {
    const { error } = await db.from('sector_ranking').upsert(rows, { onConflict: 'scan_date,etf' });
    if (error) return jsonResponse({ error: error.message }, 500);
  }
  return jsonResponse({
    ok: true, date: today, stored: rows.length, failed: SECTORS.length - rows.length,
    top: rows.filter((r) => r.rank <= 3).sort((a, b) => a.region.localeCompare(b.region) || a.rank - b.rank)
      .map((r) => `${r.region} ${r.rank}. ${r.name_es} ${r.stage} RS ${r.rs?.toFixed(1)}`),
  });
});
