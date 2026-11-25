import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Weinstein's second filter: which sectors are in Stage 2 and lead the market.
// Reads the latest day of sector_ranking (sector-ranking function, weekdays).

export interface SectorRow {
  scan_date: string;
  etf: string;
  region: 'US' | 'EU';
  name_es: string;
  name_en: string;
  stage: string;
  rs: number | null;
  rs_trend: string | null;
  dist_pct: number | null;
  sma_trend: string | null;
  rank: number;
}

export const STAGE_STYLE: Record<string, { label: string; cls: string }> = {
  STAGE_1: { label: 'Etapa 1', cls: 'bg-slate-500/15 text-slate-500 dark:text-slate-300 border-slate-500/30' },
  STAGE_2: { label: 'Etapa 2', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
  STAGE_3: { label: 'Etapa 3', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' },
  STAGE_4: { label: 'Etapa 4', cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30' },
};

const trendIcon = (t: string | null) =>
  t === 'rising' ? 'fa-arrow-up text-emerald-500' : t === 'falling' ? 'fa-arrow-down text-rose-500' : 'fa-arrow-right text-slate-400';

/** Latest sector ranking (shared by the panel and the public Stage 2 page). */
export async function loadSectorRanking(): Promise<SectorRow[]> {
  const { data: last } = await supabase.from('sector_ranking').select('scan_date').order('scan_date', { ascending: false }).limit(1).maybeSingle();
  if (!last) return [];
  const { data } = await supabase.from('sector_ranking')
    .select('scan_date, etf, region, name_es, name_en, stage, rs, rs_trend, dist_pct, sma_trend, rank')
    .eq('scan_date', last.scan_date).order('rank');
  return (data as SectorRow[]) ?? [];
}

interface Props {
  onClose: () => void;
}

const SectorPanel: React.FC<Props> = ({ onClose }) => {
  const [rows, setRows] = useState<SectorRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadSectorRanking().then((r) => { setRows(r); setLoading(false); }); }, []);

  const date = rows[0]?.scan_date;
  const column = (region: 'US' | 'EU', title: string, bench: string) => {
    const list = rows.filter((r) => r.region === region);
    return (
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">{title}</h3>
          <span className="text-[10px] text-slate-400">Fuerza relativa frente al {bench}</span>
        </div>
        <div className="space-y-1.5">
          {list.map((r) => {
            const st = STAGE_STYLE[r.stage] ?? STAGE_STYLE.STAGE_1;
            return (
              <div key={r.etf} className="flex items-center gap-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-3 py-2">
                <span className="w-5 text-right text-xs font-black text-slate-400">{r.rank}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{r.name_es}</div>
                  <div className="text-[10px] text-slate-400">{r.etf}</div>
                </div>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                <span className="w-16 text-right text-xs font-mono font-bold text-slate-700 dark:text-slate-200" title="Fuerza relativa de Mansfield y su tendencia (3 semanas)">
                  {r.rs != null ? `${r.rs > 0 ? '+' : ''}${r.rs.toFixed(1)}` : '—'} <i className={`fas ${trendIcon(r.rs_trend)} text-[9px]`} />
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-5xl mx-4 my-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
              <i className="fas fa-layer-group text-blue-500 text-lg" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Sectores</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Ordenados por etapa y fuerza relativa{date ? ` · cierre del ${new Date(`${date}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
            <i className="fas fa-xmark" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-5 leading-relaxed">
            Weinstein va de lo general a lo concreto: <strong>primero el mercado, después el sector y por último el valor</strong>.
            Las mejores compras están en los sectores en Etapa 2 con fuerza relativa alta; un buen gráfico en un sector en Etapa 4 suele fallar.
          </p>
          {loading ? (
            <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="text-center text-slate-500 py-12">Todavía no hay clasificación de sectores.</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              {column('US', '🇺🇸 Estados Unidos', 'S&P 500')}
              {column('EU', '🇪🇺 Europa', 'STOXX Europe 600')}
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-5">
            Cada sector se mide con su ETF (SPDR en EE. UU., iShares STOXX Europe 600 en Europa) y las mismas reglas que una acción:
            etapa sobre la MM30 semanal y fuerza relativa de Mansfield. Se actualiza cada día laborable tras el cierre.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SectorPanel;
