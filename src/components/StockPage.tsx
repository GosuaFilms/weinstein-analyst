import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import PublicShell from './PublicShell';
import { loadSectorRanking, type SectorRow } from './SectorPanel';
import {
  STAGE_NAME, STAGE_SUBTITLE, STAGE_BADGE, STAGE_ORDER, INDEX_LABEL,
  fmtDate, money, signed, setPageMeta,
} from '../lib/publicPage';

// Public page /valor/<slug>: the Weinstein stage of one index constituent from
// the latest daily scan (table stock_pages, written by stage2-daily). Built for
// search traffic; the full AI analysis needs an account.

interface Chart { t: number[]; c: number[]; ma: (number | null)[] }

export interface StockRow {
  symbol: string; slug: string; name: string | null; currency: string | null; index_ids: string[];
  scan_date: string; price: number | null; change_pct: number | null;
  stage: string; confidence: string | null; reasoning: string | null;
  stage_since: string | null; prev_stage: string | null;
  sma30: number | null; sma30_trend: string | null; distance_pct: number | null;
  rs: number | null; rs_trend: string | null; volume_ratio: number | null;
  high52: number | null; low52: number | null; stop_loss: number | null; stop_risk_pct: number | null;
  extended: boolean | null; base_resistance: number | null;
  benchmark: string | null; benchmark_stage: string | null; sector_etf: string | null;
  chart: Chart | null;
}

type Peer = Pick<StockRow, 'symbol' | 'slug' | 'name' | 'stage' | 'rs'>;

const TREND_ES: Record<string, string> = { rising: 'ascendente', falling: 'descendente', flat: 'plana' };

/** What Weinstein does with a stock in this stage. */
function stageAdvice(r: StockRow): string {
  const res = r.base_resistance ? ` La resistencia de la base está en ${money(r.base_resistance, r.currency)}.` : '';
  switch (r.stage) {
    case 'STAGE_1':
      return `El valor está formando una base: el precio se mueve alrededor de una media de 30 semanas sin dirección clara. Weinstein no compra todavía; espera a que el precio rompa la resistencia de la base con volumen (idealmente el doble de la media) y la MM30 empiece a subir.${res}`;
    case 'STAGE_2':
      return r.extended
        ? 'El valor está en tendencia alcista, pero más de un 15 % por encima de su MM30: está extendido. Weinstein no compra tan lejos de la media; espera un retroceso hacia ella o una nueva base. Si ya estás dentro, la clave es proteger la posición con el stop.'
        : 'El valor está en tendencia alcista: el precio cotiza sobre una MM30 ascendente. Es la única etapa en la que Weinstein compra, mejor cerca de la ruptura o en un retroceso hacia la media y siempre con un stop por debajo del soporte.';
    case 'STAGE_3':
      return 'Tras una subida, la MM30 se ha aplanado y el precio ya no avanza: es una zona de techo. Weinstein no compra en Etapa 3; quien está dentro sube el stop justo bajo la MM30 y vende si la pierde con claridad.';
    case 'STAGE_4':
      return 'El precio cotiza bajo una MM30 descendente: tendencia bajista. Weinstein no compra nunca en Etapa 4, por barato que parezca; es la etapa para estar fuera.';
    default:
      return '';
  }
}

/** Consecutive weekly closes above (or below) the MM30, counted from the latest week. */
function maStreak(chart: Chart | null): { above: boolean; weeks: number; since: number } | null {
  if (!chart || chart.c.length < 2) return null;
  const n = chart.c.length;
  const lastMa = chart.ma[n - 1];
  if (lastMa == null) return null;
  const above = chart.c[n - 1] > lastMa;
  let i = n - 1;
  while (i > 0) {
    const ma = chart.ma[i - 1];
    if (ma == null || (chart.c[i - 1] > ma) !== above) break;
    i--;
  }
  return { above, weeks: n - i, since: chart.t[i] };
}

const WeeklyChart: React.FC<{ chart: Chart; currency: string | null }> = ({ chart, currency }) => {
  // Narrow viewBox on phones so the axis labels keep a readable size
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640;
  const W = narrow ? 360 : 640, H = narrow ? 200 : 220, padL = 4, padR = narrow ? 58 : 64, padT = 12, padB = 24;
  const vals = [...chart.c, ...chart.ma.filter((v): v is number => v != null)];
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => padL + (i / (chart.c.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - min) / span) * (H - padT - padB);
  const path = (arr: (number | null)[]) =>
    arr.reduce<string>((acc, v, i) => (v == null ? acc : `${acc}${acc && arr[i - 1] != null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`), '');
  const ticks = [0, Math.floor((chart.t.length - 1) / 2), chart.t.length - 1];
  const last = chart.c[chart.c.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Cotización semanal y media de 30 semanas">
      {[min, (min + max) / 2, max].map((v) => (
        <g key={v}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.06)" />
          <text x={W - padR + 6} y={y(v) + 4} fill="#64748b" fontSize={narrow ? 10 : 11}>{money(v, currency)}</text>
        </g>
      ))}
      <path d={path(chart.ma)} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="5 4" />
      <path d={path(chart.c)} fill="none" stroke="#e2e8f0" strokeWidth="2" />
      <circle cx={x(chart.c.length - 1)} cy={y(last)} r="3.5" fill="#e2e8f0" />
      {ticks.map((i) => (
        <text key={i} x={x(i)} y={H - 6} fill="#64748b" fontSize={narrow ? 10 : 11} textAnchor={i === 0 ? 'start' : i === chart.t.length - 1 ? 'end' : 'middle'}>
          {new Date(chart.t[i] * 1000).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })}
        </text>
      ))}
    </svg>
  );
};

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
    <div className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">{label}</div>
    <div className="text-white font-black text-lg mt-0.5">{value}</div>
    {hint && <div className="text-slate-500 text-[11px] mt-0.5 leading-snug">{hint}</div>}
  </div>
);

const StockPage: React.FC<{ slug: string }> = ({ slug }) => {
  const [row, setRow] = useState<StockRow | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [sector, setSector] = useState<SectorRow | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [history, setHistory] = useState<{ scan_date: string; stage: string }[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('stock_pages').select('*').eq('slug', slug.toLowerCase()).maybeSingle();
      if (!data) {
        setNotFound(true);
        setPageMeta('Valor no encontrado — Alpha Stage', 'Fichas Weinstein de los valores del IBEX 35, S&P 100, NASDAQ, DAX, CAC 40, FTSE 100 y Euro Stoxx 50.', `/valor/${slug}`);
        return;
      }
      const r = data as StockRow;
      setRow(r);
      const title = `${r.name ?? r.symbol} (${r.symbol}): ${STAGE_NAME[r.stage]} de Weinstein — Alpha Stage`;
      const desc = `${r.name ?? r.symbol} está en ${STAGE_NAME[r.stage]} (${STAGE_SUBTITLE[r.stage]}) según el método Weinstein: precio ${signed(r.distance_pct, 1, ' %')} frente a su MM30 semanal ${TREND_ES[r.sma30_trend ?? ''] ?? ''}, fuerza relativa de Mansfield ${signed(r.rs, 1)}. Actualizado el ${fmtDate(r.scan_date)}.`;
      setPageMeta(title, desc, `/valor/${r.slug}`);

      const [sr, { data: p }, { data: h }] = await Promise.all([
        loadSectorRanking(),
        r.sector_etf
          ? supabase.from('stock_pages').select('symbol, slug, name, stage, rs').eq('sector_etf', r.sector_etf).neq('symbol', r.symbol).limit(60)
          : Promise.resolve({ data: [] as Peer[] }),
        supabase.from('stock_stage_history').select('scan_date, stage').eq('symbol', r.symbol).order('scan_date', { ascending: false }).limit(400),
      ]);
      setSector(sr.find((s) => s.etf === r.sector_etf) ?? null);
      setPeers(((p as Peer[]) ?? []).sort((a, b) => (STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]) || ((b.rs ?? -99) - (a.rs ?? -99))).slice(0, 8));
      setHistory((h as { scan_date: string; stage: string }[]) ?? []);
    })();
  }, [slug]);

  // Stage runs, newest first, from the daily history
  const runs = useMemo(() => {
    const out: { stage: string; from: string; to: string }[] = [];
    for (const h of [...history].reverse()) {
      const last = out[out.length - 1];
      if (last && last.stage === h.stage) last.to = h.scan_date;
      else out.push({ stage: h.stage, from: h.scan_date, to: h.scan_date });
    }
    return out.reverse();
  }, [history]);

  if (notFound) {
    return (
      <PublicShell>
        <div className="text-center py-20">
          <h1 className="text-3xl font-black text-white mb-3">No tenemos ficha de este valor</h1>
          <p className="text-slate-400 mb-8 max-w-lg mx-auto">
            Publicamos la etapa de los valores del IBEX 35, S&P 100, NASDAQ, DAX, CAC 40, FTSE 100 y Euro Stoxx 50.
            Cualquier otro valor puedes analizarlo dentro de la app.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="/valores" className="px-6 py-3 rounded-xl border border-white/10 text-white font-bold hover:bg-white/5">Ver todos los valores</a>
            <a href="/" className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-black">Analizar otro valor</a>
          </div>
        </div>
      </PublicShell>
    );
  }
  if (!row) {
    return <PublicShell><div className="flex justify-center py-32"><div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /></div></PublicShell>;
  }

  const r = row;
  const name = r.name ?? r.symbol;
  const streak = maStreak(r.chart);
  const benchStage = r.benchmark_stage ? STAGE_NAME[r.benchmark_stage] : null;

  return (
    <PublicShell>
      <nav className="text-xs text-slate-500 mb-6" aria-label="Ruta">
        <a href="/valores" className="hover:text-slate-300">Valores</a>
        {r.index_ids[0] && <> · <a href={`/valores#${r.index_ids[0]}`} className="hover:text-slate-300">{INDEX_LABEL[r.index_ids[0]] ?? r.index_ids[0]}</a></>}
        {' '}· <span className="text-slate-400">{r.symbol}</span>
      </nav>

      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <span className={`text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-full border ${STAGE_BADGE[r.stage]}`}>
            {STAGE_NAME[r.stage]} · {STAGE_SUBTITLE[r.stage]}
          </span>
          {r.extended && <span className="text-xs font-black uppercase px-3 py-1.5 rounded-full border bg-amber-500/15 text-amber-400 border-amber-500/30">Extendida</span>}
          <span className="text-xs text-slate-500">{r.index_ids.map((i) => INDEX_LABEL[i] ?? i).join(' · ')}</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-white leading-tight">
          {name} <span className="text-slate-500 text-2xl sm:text-3xl">({r.symbol})</span>
        </h1>
        <p className="text-slate-400 mt-3">
          <span className="text-white font-black text-2xl mr-2">{money(r.price, r.currency)}</span>
          {r.change_pct != null && (
            <span className={r.change_pct >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>{signed(r.change_pct, 2, ' %')} en la semana</span>
          )}
          <span className="block text-xs text-slate-500 mt-1">Cierre del {fmtDate(r.scan_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </p>
      </header>

      <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 sm:p-6 mb-6">
        <h2 className="text-white font-black text-lg mb-2">¿Qué haría Weinstein?</h2>
        <p className="text-slate-300 leading-relaxed">{stageAdvice(r)}</p>
        {r.stage_since && (
          <p className="text-slate-500 text-sm mt-3">
            En {STAGE_NAME[r.stage]} desde el {fmtDate(r.stage_since)}{r.prev_stage ? ` (antes, ${STAGE_NAME[r.prev_stage]})` : ''}.
          </p>
        )}
      </section>

      {r.chart && r.chart.c.length > 10 && (
        <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 sm:p-6 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-white font-black">Gráfico semanal</h2>
            <div className="flex gap-4 text-[11px] text-slate-400">
              <span><span className="inline-block w-4 h-0.5 bg-slate-200 align-middle mr-1.5" />Cierre semanal</span>
              <span><span className="inline-block w-4 border-t-2 border-dashed border-amber-500 align-middle mr-1.5" />MM30</span>
            </div>
          </div>
          <WeeklyChart chart={r.chart} currency={r.currency} />
          {streak && (
            <p className="text-slate-400 text-sm mt-3">
              Cierra {streak.above ? 'por encima' : 'por debajo'} de su media de 30 semanas desde hace{' '}
              <strong className="text-white">{streak.weeks} {streak.weeks === 1 ? 'semana' : 'semanas'}</strong>
              {streak.weeks > 1 && <> (semana del {fmtDate(new Date(streak.since * 1000).toISOString(), { day: 'numeric', month: 'long', year: 'numeric' })})</>}.
            </p>
          )}
        </section>
      )}

      <section className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <Stat label="Frente a la MM30" value={signed(r.distance_pct, 1, ' %')} hint={`MM30 ${money(r.sma30, r.currency)} · ${TREND_ES[r.sma30_trend ?? ''] ?? '—'}`} />
        <Stat label="Fuerza relativa" value={signed(r.rs, 1)}
          hint={`Mansfield frente al ${r.benchmark ?? 'índice'}${r.rs_trend ? ` · ${r.rs_trend === 'rising' ? 'subiendo' : r.rs_trend === 'falling' ? 'bajando' : 'estable'}` : ''}`} />
        <Stat label="Volumen semanal" value={r.volume_ratio == null ? '—' : `${r.volume_ratio.toFixed(1).replace('.', ',')}×`} hint="Última semana completa frente a su media" />
        <Stat label="Rango 52 semanas" value={<span className="text-base">{money(r.low52, r.currency)} – {money(r.high52, r.currency)}</span>} />
        {r.stage === 'STAGE_2' && r.stop_loss != null && (
          <Stat label="Stop técnico" value={money(r.stop_loss, r.currency)} hint={r.stop_risk_pct != null ? `${r.stop_risk_pct.toFixed(1).replace('.', ',')} % bajo el precio, bajo el soporte` : undefined} />
        )}
        {benchStage && <Stat label="Mercado" value={benchStage} hint={`${r.benchmark ?? 'Índice de referencia'}: ${r.benchmark_stage === 'STAGE_4' ? 'Weinstein no compra contra un mercado bajista' : STAGE_SUBTITLE[r.benchmark_stage!]}`} />}
      </section>

      {sector && (
        <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 sm:p-6 mb-6">
          <h2 className="text-white font-black mb-1">Sector: {sector.name_es}</h2>
          <p className="text-slate-400 text-sm mb-4">
            {sector.name_es} está en <strong className={sector.stage === 'STAGE_2' ? 'text-emerald-400' : sector.stage === 'STAGE_4' ? 'text-rose-400' : 'text-white'}>{STAGE_NAME[sector.stage]}</strong>,
            puesto {sector.rank} de los sectores de {sector.region === 'US' ? 'EE. UU.' : 'Europa'}. Weinstein busca los mejores valores de los mejores sectores:
            {sector.stage === 'STAGE_2' ? ' este sector acompaña.' : sector.stage === 'STAGE_4' ? ' un buen gráfico en un sector en Etapa 4 suele fallar.' : ' el sector no está en su mejor momento.'}
          </p>
          {peers.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-2">
              {peers.map((p) => (
                <a key={p.symbol} href={`/valor/${p.slug}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 px-3 py-2 hover:bg-white/5">
                  <span className="min-w-0">
                    <span className="text-white font-bold text-sm">{p.symbol}</span>
                    <span className="block text-slate-500 text-xs truncate">{p.name}</span>
                  </span>
                  <span className={`shrink-0 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${STAGE_BADGE[p.stage]}`}>{STAGE_NAME[p.stage]}</span>
                </a>
              ))}
            </div>
          )}
        </section>
      )}

      {r.reasoning && (
        <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 sm:p-6 mb-6">
          <h2 className="text-white font-black mb-2">Lectura técnica</h2>
          <p className="text-slate-400 text-sm leading-relaxed">{r.reasoning}</p>
        </section>
      )}

      {runs.length > 0 && (
        <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 sm:p-6 mb-6">
          <h2 className="text-white font-black mb-3">Historial de etapas</h2>
          <ul className="space-y-1.5 text-sm">
            {runs.slice(0, 8).map((u) => (
              <li key={u.from} className="flex items-center gap-3">
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${STAGE_BADGE[u.stage]}`}>{STAGE_NAME[u.stage]}</span>
                <span className="text-slate-400">
                  {u.from === u.to ? fmtDate(u.from) : `${fmtDate(u.from, { day: 'numeric', month: 'short' })} – ${fmtDate(u.to, { day: 'numeric', month: 'short', year: 'numeric' })}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-slate-500 text-xs mt-3">Seguimiento diario desde el {fmtDate(runs[runs.length - 1].from)}.</p>
        </section>
      )}

      <div className="rounded-3xl p-7 sm:p-9 text-center" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(251,191,36,0.05))', border: '1px solid rgba(245,158,11,0.2)' }}>
        <div className="text-2xl sm:text-3xl font-black text-white mb-3">Análisis completo de {name}</div>
        <p className="text-slate-400 mb-6 max-w-lg mx-auto">
          La IA revisa la base, el volumen de ruptura, el mercado y el sector, y te da un plan con entrada, stop y objetivos. 3 análisis gratis al mes, sin tarjeta.
        </p>
        <a href={`/?analizar=${encodeURIComponent(r.symbol)}`} className="inline-flex items-center gap-3 px-8 py-4 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-lg rounded-2xl">
          <i className="fas fa-magnifying-glass-chart" /> Analizar {r.symbol} gratis
        </a>
        <p className="text-slate-500 text-xs mt-5">
          ¿Funciona el método? Mira el <a href="/resultados" className="underline hover:text-slate-300">historial público de señales</a> o la{' '}
          <a href="/etapa-2" className="underline hover:text-slate-300">lista de valores en Etapa 2 hoy</a>.
        </p>
      </div>
    </PublicShell>
  );
};

export default StockPage;
