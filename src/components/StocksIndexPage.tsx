import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import PublicShell from './PublicShell';
import { STAGE_NAME, STAGE_BADGE, STAGE_ORDER, INDEX_LABEL, INDEX_ORDER, fmtDate, signed, setPageMeta } from '../lib/publicPage';

// Public page /valores: every stock with a page, grouped by index, so visitors
// and crawlers can reach each /valor/<slug>.

interface Item { symbol: string; slug: string; name: string | null; stage: string; rs: number | null; index_ids: string[]; scan_date: string }

const StocksIndexPage: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [stage, setStage] = useState<string>('ALL');

  useEffect(() => {
    setPageMeta(
      'Etapa de Weinstein de cada acción del IBEX 35, S&P 100, NASDAQ y Europa — Alpha Stage',
      'Consulta gratis en qué etapa de Stan Weinstein está cada valor del IBEX 35, S&P 100, NASDAQ, DAX 40, CAC 40, FTSE 100 y Euro Stoxx 50, actualizado cada día tras el cierre.',
      '/valores',
    );
    supabase.from('stock_pages').select('symbol, slug, name, stage, rs, index_ids, scan_date').order('symbol').then(({ data }) => {
      setItems((data as Item[]) ?? []);
      setLoading(false);
      // Jump to an index anchor (/valores#IBEX35) once the list exists
      if (window.location.hash) setTimeout(() => document.getElementById(window.location.hash.slice(1))?.scrollIntoView(), 50);
    });
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((i) => (stage === 'ALL' || i.stage === stage)
      && (!term || i.symbol.toLowerCase().includes(term) || (i.name ?? '').toLowerCase().includes(term)));
  }, [items, q, stage]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of items) c[i.stage] = (c[i.stage] ?? 0) + 1;
    return c;
  }, [items]);

  const date = items[0]?.scan_date;
  const chip = (active: boolean) =>
    `shrink-0 px-3.5 py-2 rounded-xl text-xs font-black transition-all border ${active ? 'bg-amber-500 text-slate-900 border-amber-500' : 'bg-white/5 text-slate-400 hover:text-white border-white/5'}`;

  return (
    <PublicShell>
      <header className="text-center mb-8">
        <h1 className="text-3xl sm:text-5xl font-black text-white mb-4 leading-tight">¿En qué etapa está cada valor?</h1>
        <p className="text-slate-400 max-w-2xl mx-auto">
          La etapa de Stan Weinstein de los valores de siete índices, calculada cada día tras el cierre con la media de 30 semanas,
          su pendiente y la fuerza relativa de Mansfield.
        </p>
        {date && <p className="text-slate-500 text-sm mt-3">Cierre del {fmtDate(date)} · {items.length} valores</p>}
      </header>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o ticker…" aria-label="Buscar valor"
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-amber-500/50"
        />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
        <button className={chip(stage === 'ALL')} onClick={() => setStage('ALL')}>Todas · {items.length}</button>
        {['STAGE_2', 'STAGE_1', 'STAGE_3', 'STAGE_4'].map((s) => (
          <button key={s} className={chip(stage === s)} onClick={() => setStage(s)}>{STAGE_NAME[s]} · {counts[s] ?? 0}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-10">
          {INDEX_ORDER.map((idx) => {
            const list = filtered.filter((i) => i.index_ids.includes(idx))
              .sort((a, b) => (STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]) || ((b.rs ?? -99) - (a.rs ?? -99)));
            if (!list.length) return null;
            return (
              <section key={idx} id={idx} className="scroll-mt-20">
                <h2 className="text-white font-black text-xl mb-3">{INDEX_LABEL[idx]} <span className="text-slate-500 text-sm font-bold">· {list.length}</span></h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {list.map((i) => (
                    <a key={i.symbol} href={`/valor/${i.slug}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 hover:bg-white/5">
                      <span className="min-w-0">
                        <span className="text-white font-bold text-sm">{i.symbol}</span>
                        <span className="block text-slate-500 text-xs truncate">{i.name}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`block text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${STAGE_BADGE[i.stage]}`}>{STAGE_NAME[i.stage]}</span>
                        <span className="block text-[10px] text-slate-500 mt-0.5" title="Fuerza relativa de Mansfield">FR {signed(i.rs, 1)}</span>
                      </span>
                    </a>
                  ))}
                </div>
              </section>
            );
          })}
          {filtered.length === 0 && <p className="text-center text-slate-500 py-16">No hay valores con este filtro.</p>}
        </div>
      )}
    </PublicShell>
  );
};

export default StocksIndexPage;
