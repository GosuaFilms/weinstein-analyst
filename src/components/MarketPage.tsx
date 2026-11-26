import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import PublicShell from './PublicShell';
import { loadSectorRanking, type SectorRow } from './SectorPanel';
import { STAGE_NAME, STAGE_BADGE, INDEX_LABEL, INDEX_ORDER, fmtDate, setPageMeta } from '../lib/publicPage';

// Public page /mercado: the market thermometer (Weinstein's first step: market →
// sector → stock). Breadth per index from market_breadth (stage2-daily), plus the
// leading sectors.

interface Breadth {
  index_id: string; scan_date: string; n: number; counts: Record<string, number>;
  pct_above: number | null; pct_uptrend: number | null; pct_stage2: number | null;
  index_stage: string | null; benchmark: string | null;
  series: { t: number[]; above: number[]; up: number[] };
}

const LABEL: Record<string, string> = { ...INDEX_LABEL, ALL: 'Todos los índices' };
const ORDER = ['ALL', ...INDEX_ORDER];
const fmtPct = (v: number | null | undefined) => (v == null ? '—' : `${Number(v).toFixed(0)} %`);

/** Change of a series over `weeks` weeks, in percentage points. */
function delta(series: number[], weeks: number): number | null {
  if (series.length <= weeks) return null;
  return Math.round((series[series.length - 1] - series[series.length - 1 - weeks]) * 10) / 10;
}

/** Plain-language reading of the breadth, Weinstein style. */
function reading(b: Breadth): { tone: 'good' | 'mid' | 'bad'; title: string; text: string } {
  const above = Number(b.pct_above ?? 0);
  const d4 = delta(b.series.above, 4) ?? 0;
  const trend = d4 >= 5 ? 'mejorando' : d4 <= -5 ? 'empeorando' : 'estable';
  const zone = above >= 70 ? 'fuerte' : above >= 50 ? 'sano' : above >= 30 ? 'débil' : 'muy débil';
  const tone: 'good' | 'mid' | 'bad' = above >= 50 && d4 > -5 ? 'good' : above < 30 || (above < 50 && d4 < 0) ? 'bad' : 'mid';
  let text: string;
  if (above >= 70) text = 'La mayoría de valores está en tendencia alcista. Es un mercado fuerte, pero cuando la amplitud llega tan arriba suele quedar poco recorrido: Weinstein es más selectivo y vigila los stops.';
  else if (above >= 50) text = 'Más de la mitad de los valores cotiza sobre su MM30. Es un entorno en el que las compras en Etapa 2 tienen el viento a favor.';
  else if (above >= 30) text = 'Menos de la mitad de los valores está sobre su MM30: el mercado está dividido. Weinstein compra solo los valores más fuertes, en sectores que suban, y con menos dinero.';
  else text = 'Muy pocos valores están sobre su MM30. Es terreno de Etapa 4: Weinstein no compra. Cuando este porcentaje empiece a subir desde aquí puede estar formándose un suelo.';
  if (trend === 'empeorando' && above >= 30) text += ' Ojo: la amplitud está cayendo, cada vez menos valores acompañan.';
  if (trend === 'mejorando' && above < 70) text += ' La buena noticia: la amplitud está mejorando.';
  return { tone, title: `${zone[0].toUpperCase()}${zone.slice(1)} y ${trend}`, text };
}

const ChartLines: React.FC<{ b: Breadth }> = ({ b }) => {
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640;
  const W = narrow ? 360 : 720, H = narrow ? 200 : 240, padL = 30, padR = 8, padT = 10, padB = 24;
  const n = b.series.t.length;
  if (n < 2) return null;
  const x = (i: number) => padL + (i / (n - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / 100) * (H - padT - padB);
  const path = (arr: number[]) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const ticks = [0, Math.floor((n - 1) / 2), n - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Amplitud semanal de ${LABEL[b.index_id]}`}>
      <rect x={padL} y={y(100)} width={W - padL - padR} height={y(70) - y(100)} fill="rgba(16,185,129,0.06)" />
      <rect x={padL} y={y(30)} width={W - padL - padR} height={y(0) - y(30)} fill="rgba(244,63,94,0.06)" />
      {[0, 30, 50, 70, 100].map((v) => (
        <g key={v}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={v === 50 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)'} strokeDasharray={v === 50 ? '4 4' : undefined} />
          <text x={padL - 6} y={y(v) + 4} fill="#64748b" fontSize={narrow ? 10 : 11} textAnchor="end">{v}</text>
        </g>
      ))}
      <path d={path(b.series.above)} fill="none" stroke="#e2e8f0" strokeWidth="2" />
      <path d={path(b.series.up)} fill="none" stroke="#34d399" strokeWidth="2" />
      {ticks.map((i) => (
        <text key={i} x={x(i)} y={H - 6} fill="#64748b" fontSize={narrow ? 10 : 11} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
          {new Date(b.series.t[i] * 1000).toLocaleDateString('es-ES', { month: 'short', year: '2-digit', timeZone: 'UTC' })}
        </text>
      ))}
    </svg>
  );
};

const StageBar: React.FC<{ counts: Record<string, number>; n: number }> = ({ counts, n }) => (
  <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/5" title="Reparto por etapas">
    {(['STAGE_2', 'STAGE_1', 'STAGE_3', 'STAGE_4'] as const).map((s) => {
      const w = n ? ((counts[s] ?? 0) / n) * 100 : 0;
      const color = s === 'STAGE_2' ? 'bg-emerald-500' : s === 'STAGE_1' ? 'bg-slate-400' : s === 'STAGE_3' ? 'bg-amber-500' : 'bg-rose-500';
      return w > 0 ? <div key={s} className={color} style={{ width: `${w}%` }} /> : null;
    })}
  </div>
);

const Delta: React.FC<{ v: number | null }> = ({ v }) =>
  v == null ? <span className="text-slate-500">—</span> : (
    <span className={v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-slate-400'}>
      {v > 0 ? '▲' : v < 0 ? '▼' : '•'} {Math.abs(v).toFixed(0)} pts
    </span>
  );

const MarketPage: React.FC = () => {
  const [rows, setRows] = useState<Breadth[]>([]);
  const [sectors, setSectors] = useState<SectorRow[]>([]);
  const [selected, setSelected] = useState('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPageMeta(
      'Termómetro del mercado: amplitud y etapas de Weinstein por índice — Alpha Stage',
      'Qué porcentaje de valores del IBEX 35, S&P 100, NASDAQ, DAX, CAC 40, FTSE 100 y Euro Stoxx 50 está sobre su media de 30 semanas y en Etapa 2, semana a semana, y qué sectores lideran.',
      '/mercado',
    );
    Promise.all([
      supabase.from('market_breadth').select('*'),
      loadSectorRanking(),
    ]).then(([{ data }, sr]) => {
      setRows(((data as Breadth[]) ?? []).sort((a, b) => ORDER.indexOf(a.index_id) - ORDER.indexOf(b.index_id)));
      setSectors(sr);
      setLoading(false);
    });
  }, []);

  const all = rows.find((r) => r.index_id === 'ALL');
  const sel = rows.find((r) => r.index_id === selected) ?? all;
  const read = useMemo(() => (sel ? reading(sel) : null), [sel]);
  const toneCls = read?.tone === 'good' ? 'text-emerald-400' : read?.tone === 'bad' ? 'text-rose-400' : 'text-amber-400';
  const leaders = (region: 'US' | 'EU') => sectors.filter((s) => s.region === region && s.stage === 'STAGE_2').slice(0, 3);

  return (
    <PublicShell>
      <header className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-300 text-xs font-black uppercase tracking-widest mb-5">
          <i className="fas fa-temperature-half" /> Primer paso de Weinstein
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-white mb-4 leading-tight">Termómetro del mercado</h1>
        <p className="text-slate-400 max-w-2xl mx-auto">
          Antes de mirar un valor, Weinstein mira el mercado: ¿cuántos valores están en tendencia alcista? Si la mayoría acompaña, el viento sopla a favor;
          si cada vez son menos, toca ser prudente aunque el índice todavía suba.
        </p>
        {all && <p className="text-slate-500 text-sm mt-3">Cierre del {fmtDate(all.scan_date)} · {all.n} valores de 7 índices</p>}
      </header>

      {loading ? (
        <div className="flex justify-center py-24"><div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /></div>
      ) : !sel ? (
        <p className="text-center text-slate-500 py-16">Todavía no hay datos del termómetro.</p>
      ) : (
        <>
          <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 sm:p-6 mb-6">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
              <div>
                <div className="text-slate-500 text-xs font-bold uppercase tracking-wider">{LABEL[sel.index_id]}</div>
                <div className={`text-2xl sm:text-3xl font-black ${toneCls}`}>{read?.title}</div>
              </div>
              <div className="flex gap-6 text-right">
                <div>
                  <div className="text-white text-3xl font-black">{fmtPct(sel.pct_above)}</div>
                  <div className="text-slate-500 text-[11px] font-bold">sobre su MM30</div>
                </div>
                <div>
                  <div className="text-emerald-400 text-3xl font-black">{fmtPct(sel.pct_uptrend)}</div>
                  <div className="text-slate-500 text-[11px] font-bold">en Etapa 2</div>
                </div>
              </div>
            </div>
            <p className="text-slate-300 leading-relaxed mb-4">{read?.text}</p>
            <ChartLines b={sel} />
            <div className="flex flex-wrap gap-4 text-[11px] text-slate-400 mt-2">
              <span><span className="inline-block w-4 h-0.5 bg-slate-200 align-middle mr-1.5" />% sobre su MM30</span>
              <span><span className="inline-block w-4 h-0.5 bg-emerald-400 align-middle mr-1.5" />% en Etapa 2 (sobre una MM30 que sube)</span>
              <span className="text-slate-500">Zona verde: más del 70 %. Zona roja: menos del 30 %.</span>
            </div>
          </section>

          <section className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden mb-6">
            <div className="hidden sm:grid grid-cols-[1.6fr_1fr_0.8fr_0.8fr_0.9fr_1.2fr] gap-3 px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5">
              <span>Índice</span><span>Etapa del índice</span><span className="text-right">Sobre MM30</span><span className="text-right">Etapa 2</span><span className="text-right">4 semanas</span><span>Reparto</span>
            </div>
            {rows.map((r) => (
              <button key={r.index_id} onClick={() => setSelected(r.index_id)}
                className={`w-full text-left grid grid-cols-2 sm:grid-cols-[1.6fr_1fr_0.8fr_0.8fr_0.9fr_1.2fr] gap-x-3 gap-y-2 items-center px-5 py-3 border-b border-white/5 last:border-0 transition-colors ${selected === r.index_id ? 'bg-amber-500/10' : 'hover:bg-white/5'}`}>
                <span className="text-white font-bold text-sm">{LABEL[r.index_id]} <span className="text-slate-500 text-xs font-normal">· {r.n}</span></span>
                <span>
                  {r.index_stage
                    ? <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${STAGE_BADGE[r.index_stage]}`} title={r.benchmark ?? ''}>{STAGE_NAME[r.index_stage]}</span>
                    : <span className="text-slate-600 text-xs">—</span>}
                </span>
                <span className="text-white font-black text-sm sm:text-right"><span className="sm:hidden text-slate-500 text-[10px] font-bold mr-1">MM30</span>{fmtPct(r.pct_above)}</span>
                <span className="text-emerald-400 font-black text-sm sm:text-right"><span className="sm:hidden text-slate-500 text-[10px] font-bold mr-1">E2</span>{fmtPct(r.pct_uptrend)}</span>
                <span className="text-xs sm:text-right"><Delta v={delta(r.series.above, 4)} /></span>
                <StageBar counts={r.counts} n={r.n} />
              </button>
            ))}
          </section>

          {sectors.length > 0 && (
            <section className="grid sm:grid-cols-2 gap-4 mb-6">
              {(['US', 'EU'] as const).map((reg) => (
                <div key={reg} className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                  <h2 className="text-white font-black mb-1">Sectores que lideran {reg === 'US' ? 'en EE. UU.' : 'en Europa'}</h2>
                  <p className="text-slate-500 text-xs mb-3">Segundo paso de Weinstein: los mejores valores están en los sectores en Etapa 2.</p>
                  {leaders(reg).length === 0 ? (
                    <p className="text-slate-400 text-sm">Ningún sector en Etapa 2 ahora mismo.</p>
                  ) : (
                    <ol className="space-y-1.5">
                      {leaders(reg).map((s) => (
                        <li key={s.etf} className="flex items-center justify-between text-sm">
                          <span className="text-slate-200 font-bold">{s.rank}. {s.name_es}</span>
                          <span className="text-emerald-400 text-xs font-bold">FR {s.rs != null ? `${s.rs > 0 ? '+' : ''}${s.rs.toFixed(1).replace('.', ',')}` : '—'}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </section>
          )}

          <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 text-sm text-slate-400 leading-relaxed mb-8">
            <h2 className="text-white font-black mb-2">Cómo se calcula</h2>
            <p>
              Cada día tras el cierre clasificamos los valores de siete índices con las reglas de Weinstein. «Sobre su MM30» es el porcentaje de valores cuyo cierre
              semanal está por encima de su media de 30 semanas; «en Etapa 2», el de los que además tienen esa media subiendo, la misma regla que usamos para
              clasificar cada valor. La historia se reconstruye con los cierres semanales de cada valor. La etapa del índice se mide sobre el propio índice
              (el Euro Stoxx 50 no tiene una única referencia, porque cada valor se compara con el índice de su país).
            </p>
          </section>

          <div className="rounded-3xl p-7 sm:p-9 text-center" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(251,191,36,0.05))', border: '1px solid rgba(245,158,11,0.2)' }}>
            <div className="text-2xl sm:text-3xl font-black text-white mb-3">Del mercado al valor</div>
            <p className="text-slate-400 mb-6 max-w-lg mx-auto">
              Mira los <a href="/etapa-2" className="text-amber-400 hover:underline">valores en Etapa 2 de hoy</a> o la{' '}
              <a href="/valores" className="text-amber-400 hover:underline">etapa de cada valor</a>, y analiza el que te interese con un plan de entrada y stop.
            </p>
            <a href="/" className="inline-flex items-center gap-3 px-8 py-4 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-lg rounded-2xl">
              <i className="fas fa-magnifying-glass-chart" /> Analizar gratis
            </a>
          </div>
        </>
      )}
    </PublicShell>
  );
};

export default MarketPage;
