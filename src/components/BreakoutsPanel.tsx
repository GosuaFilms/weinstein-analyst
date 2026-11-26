import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { STAGE_STYLE } from './SectorPanel';

// Mercado → Rupturas (Pro): Weinstein's buy point. "Cerca de romper" lists stocks
// within 5 % of the entry level over their base resistance (stock_pages, daily
// scan); "Rupturas recientes" the breakouts stage2-daily detected (base_breakouts)
// with their weekly confirmation. Free users see the counts and a sample.

interface Near {
  symbol: string; slug: string; name: string | null; currency: string | null; stage: string; price: number | null;
  base_resistance: number | null; sma30_trend: string | null; rs: number | null; rs_trend: string | null; extended: boolean | null;
}
interface Breakout {
  id: number; symbol: string; slug: string; name: string | null; kind: 'base' | 'continuation'; detected_on: string;
  resistance: number; entry_level: number; price: number; rs: number | null; confirmed: boolean | null; volume_ratio: number | null; failed_on: string | null;
}

const NEAR_PCT = 5;
const FREE_SAMPLE = 2;
const fmt = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: 2 }));
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

function status(b: Breakout): { label: string; cls: string } {
  if (b.failed_on) return { label: `Fallida · ${day(b.failed_on)}`, cls: 'text-rose-500 bg-rose-500/10 border-rose-500/30' };
  if (b.confirmed === true) return b.volume_ratio != null && b.volume_ratio >= 2
    ? { label: `Confirmada · vol ${b.volume_ratio.toFixed(1)}×`, cls: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30' }
    : { label: `Confirmada · vol ${b.volume_ratio?.toFixed(1) ?? '—'}× (flojo)`, cls: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30' };
  if (b.confirmed === false) return { label: 'No aguantó el viernes', cls: 'text-rose-500 bg-rose-500/10 border-rose-500/30' };
  return { label: 'En curso · se confirma el viernes', cls: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/30' };
}

interface Props { onClose: () => void; isPro: boolean; onUpgrade: () => void }

const BreakoutsPanel: React.FC<Props> = ({ onClose, isPro, onUpgrade }) => {
  const [near, setNear] = useState<Near[]>([]);
  const [recent, setRecent] = useState<Breakout[]>([]);
  const [tab, setTab] = useState<'near' | 'recent'>('near');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    Promise.all([
      supabase.from('stock_pages').select('symbol, slug, name, currency, stage, price, base_resistance, sma30_trend, rs, rs_trend, extended').in('stage', ['STAGE_1', 'STAGE_2']),
      supabase.from('base_breakouts').select('id, symbol, slug, name, kind, detected_on, resistance, entry_level, price, rs, confirmed, volume_ratio, failed_on').gte('detected_on', since).order('detected_on', { ascending: false }),
    ]).then(([{ data: n }, { data: r }]) => {
      setNear((n as Near[]) ?? []);
      setRecent((r as Breakout[]) ?? []);
      setLoading(false);
    });
  }, []);

  // Below the entry (resistance +1 %), within 5 %, MM30 not falling; Stage 2 only when not extended
  const candidates = useMemo(() => near
    .map((s) => {
      const entry = s.base_resistance != null ? s.base_resistance * 1.01 : null;
      const dist = entry && s.price ? ((entry - s.price) / s.price) * 100 : null;
      return { ...s, entry, dist };
    })
    .filter((s) => s.dist != null && s.dist > 0 && s.dist <= NEAR_PCT && s.sma30_trend !== 'falling' && !(s.stage === 'STAGE_2' && s.extended))
    .sort((a, b) => (a.stage === b.stage ? 0 : a.stage === 'STAGE_1' ? -1 : 1) || a.dist! - b.dist!), [near]);

  const visibleNear = isPro ? candidates : candidates.slice(0, FREE_SAMPLE);
  const visibleRecent = isPro ? recent : recent.slice(0, FREE_SAMPLE);
  const hidden = (tab === 'near' ? candidates.length : recent.length) - (tab === 'near' ? visibleNear.length : visibleRecent.length);
  const chip = (on: boolean) => `px-4 py-2 rounded-xl text-xs font-black border ${on ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white' : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'}`;

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl mx-4 my-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center"><i className="fas fa-rocket text-emerald-500 text-lg" /></div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Rupturas de base {!isPro && <span className="ml-1 align-middle text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500 text-slate-900">Pro</span>}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">El punto de compra de Weinstein: el precio supera la resistencia de la base</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><i className="fas fa-xmark" /></button>
        </div>

        <div className="p-6">
          <div className="flex gap-2 mb-5">
            <button className={chip(tab === 'near')} onClick={() => setTab('near')}>Cerca de romper · {candidates.length}</button>
            <button className={chip(tab === 'recent')} onClick={() => setTab('recent')}>Rupturas recientes · {recent.length}</button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : tab === 'near' ? (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
                Valores a menos de un {NEAR_PCT} % de su punto de entrada (1 % sobre la resistencia de la base) y con la MM30 que ya no baja.
                Primero los que salen de una base (Etapa 1); después los de Etapa 2 que consolidan antes de un nuevo máximo.
              </p>
              {visibleNear.length === 0 ? <p className="text-center text-slate-500 py-10">Ningún valor cerca de romper ahora mismo.</p> : (
                <div className="space-y-1.5">
                  {visibleNear.map((s) => {
                    const st = STAGE_STYLE[s.stage] ?? STAGE_STYLE.STAGE_1;
                    return (
                      <a key={s.symbol} href={`/valor/${s.slug}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-3 py-2.5 hover:border-emerald-500/40">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-black text-slate-800 dark:text-slate-100">{s.symbol} <span className="font-normal text-slate-400 text-xs">{s.name}</span></div>
                          <div className="text-[11px] text-slate-500">Precio {fmt(s.price)} · entrada {fmt(s.entry)} · FR {s.rs != null ? `${s.rs > 0 ? '+' : ''}${s.rs.toFixed(1)}` : '—'}</div>
                        </div>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                        <span className="w-16 text-right text-xs font-mono font-black text-emerald-600 dark:text-emerald-400">{s.dist!.toFixed(1)} %</span>
                      </a>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
                Rupturas de los últimos 30 días. Se confirman con el cierre del viernes: precio sobre el punto de entrada y, según Weinstein, volumen de la semana de 2× su media o más.
                Si el precio vuelve a meterse en la base, la ruptura ha fallado.
              </p>
              {visibleRecent.length === 0 ? (
                <p className="text-center text-slate-500 py-10">Todavía no hay rupturas registradas. Se detectan cada noche tras el cierre.</p>
              ) : (
                <div className="space-y-1.5">
                  {visibleRecent.map((b) => {
                    const s = status(b);
                    return (
                      <a key={b.id} href={`/valor/${b.slug}`} target="_blank" rel="noopener noreferrer"
                        className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-3 py-2.5 hover:border-emerald-500/40">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-black text-slate-800 dark:text-slate-100">{b.symbol} <span className="font-normal text-slate-400 text-xs">{b.name}</span></div>
                          <div className="text-[11px] text-slate-500">
                            {day(b.detected_on)} · {b.kind === 'base' ? 'sale de su base' : 'nuevo máximo en Etapa 2'} · resistencia {fmt(b.resistance)} · precio {fmt(b.price)}
                          </div>
                        </div>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border whitespace-nowrap ${s.cls}`}>{s.label}</span>
                      </a>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {!isPro && hidden > 0 && (
            <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-center">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">{hidden} {hidden === 1 ? 'valor más' : 'valores más'} con el plan Pro</p>
              <p className="text-xs text-slate-500 mb-4">Con Pro ves la lista completa y recibes un aviso cada noche cuando un valor rompe su base, por Telegram o email.</p>
              <button onClick={onUpgrade} className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-sm"><i className="fas fa-crown mr-2" />Pasar a Pro</button>
            </div>
          )}
          {isPro && (
            <p className="text-[11px] text-slate-400 mt-5">
              Recibes un aviso cada noche que haya rupturas (Telegram si lo tienes conectado; si no, email). Puedes desactivarlo en tu perfil → Notificaciones.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default BreakoutsPanel;
