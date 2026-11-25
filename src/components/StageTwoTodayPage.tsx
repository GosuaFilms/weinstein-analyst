import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { loadSectorRanking, type SectorRow } from './SectorPanel';

// Public page /etapa-2: the latest daily Stage 2 scan (table stage2_snapshots,
// written by the stage2-daily function), readable without an account.
// Entry point for search and social traffic; the full AI analysis needs sign-up.

interface Row {
  symbol: string;
  name: string;
  index_id: string;
  currency: string | null;
  current_price: number | null;
  confidence: string | null;
  distance_pct: number | null;
  mansfield_rs: number | null;
  volume_ratio: number | null;
  extended: boolean | null;
  stop_loss: number | null;
  stop_risk_pct: number | null;
  sector_etf: string | null;
}

const INDEX_LABEL: Record<string, string> = {
  IBEX35: 'IBEX 35', SP100: 'S&P 100', NASDAQ50: 'NASDAQ', DAX40: 'DAX 40',
  CAC40: 'CAC 40', FTSE100: 'FTSE 100', EUROSTOXX50: 'Euro Stoxx 50',
};
const INDEX_ORDER = ['IBEX35', 'SP100', 'NASDAQ50', 'DAX40', 'CAC40', 'FTSE100', 'EUROSTOXX50'];

type Sort = 'rs' | 'distance' | 'volume';

const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function money(v: number | null, currency: string | null) {
  if (v == null) return '—';
  if (currency === 'GBp' || currency === 'GBX') return `${v.toFixed(1)} p`;
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency ?? ''}`;
  }
}
const num = (v: number | null, d = 1, suffix = '') => (v == null ? '—' : `${v > 0 && suffix === '%' ? '+' : ''}${v.toFixed(d)}${suffix}`);

function setMeta(title: string, description: string) {
  document.title = title;
  let m = document.querySelector('meta[name="description"]');
  if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'description'); document.head.appendChild(m); }
  m.setAttribute('content', description);
}

const StageTwoTodayPage: React.FC = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [prevKeys, setPrevKeys] = useState<Set<string> | null>(null);
  const [scanDate, setScanDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState<string>('ALL');
  const [onlyNew, setOnlyNew] = useState(false);
  const [sort, setSort] = useState<Sort>('rs');
  const [sectors, setSectors] = useState<Map<string, SectorRow>>(new Map());
  const [strongSectors, setStrongSectors] = useState(false);

  useEffect(() => {
    setMeta(
      'Acciones en Etapa 2 hoy (método Weinstein) — Alpha Stage',
      'Lista diaria y gratuita de acciones en Etapa 2 de Stan Weinstein en el IBEX 35, S&P 100, NASDAQ, DAX, CAC 40, FTSE 100 y Euro Stoxx 50: distancia a la MM30, fuerza relativa de Mansfield, volumen y stop.',
    );
    (async () => {
      const { data: last } = await supabase.from('stage2_snapshots').select('scan_date').order('scan_date', { ascending: false }).limit(1).maybeSingle();
      if (!last) { setLoading(false); return; }
      const date = last.scan_date as string;
      const [{ data: today }, { data: prev }] = await Promise.all([
        supabase.from('stage2_snapshots')
          .select('symbol, name, index_id, currency, current_price, confidence, distance_pct, mansfield_rs, volume_ratio, extended, stop_loss, stop_risk_pct, sector_etf')
          .eq('scan_date', date),
        supabase.from('stage2_snapshots').select('scan_date').lt('scan_date', date).order('scan_date', { ascending: false }).limit(1).maybeSingle(),
      ]);
      let prevSet: Set<string> | null = null;
      // A previous scan more than 5 days old says nothing about "new today"
      if (prev && (Date.parse(date) - Date.parse(prev.scan_date)) / 86_400_000 <= 5) {
        const { data: prevRows } = await supabase.from('stage2_snapshots').select('symbol, index_id').eq('scan_date', prev.scan_date);
        prevSet = new Set((prevRows ?? []).map((r) => `${r.index_id}:${r.symbol}`));
      }
      setRows((today as Row[]) ?? []);
      loadSectorRanking().then((sr) => setSectors(new Map(sr.map((x) => [x.etf, x]))));
      setPrevKeys(prevSet);
      setScanDate(date);
      setLoading(false);
    })();
  }, []);

  const isNew = (r: Row) => prevKeys != null && !prevKeys.has(`${r.index_id}:${r.symbol}`);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.index_id] = (c[r.index_id] ?? 0) + 1;
    return c;
  }, [rows]);
  const uniqueCount = new Set(rows.map((r) => r.symbol)).size;
  const newCount = new Set(rows.filter(isNew).map((r) => r.symbol)).size;

  const visible = useMemo(() => {
    const key: Record<Sort, (r: Row) => number> = {
      rs: (r) => r.mansfield_rs ?? -Infinity,
      distance: (r) => -(r.distance_pct ?? Infinity), // closest to the MM30 first
      volume: (r) => r.volume_ratio ?? -Infinity,
    };
    const seen = new Set<string>();
    return rows
      .filter((r) => (index === 'ALL' || r.index_id === index) && (!onlyNew || isNew(r)))
      .filter((r) => !strongSectors || (r.sector_etf != null && sectors.get(r.sector_etf)?.stage === 'STAGE_2'))
      // A stock in two indices (e.g. SAN.PA in CAC 40 and Euro Stoxx 50) is listed once under "Todos"
      .filter((r) => index !== 'ALL' || (!seen.has(r.symbol) && seen.add(r.symbol)))
      .sort((a, b) => key[sort](b) - key[sort](a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, index, onlyNew, sort, prevKeys, strongSectors, sectors]);

  const chip = (active: boolean) =>
    `shrink-0 px-3.5 py-2 rounded-xl text-xs font-black transition-all border ${active ? 'bg-amber-500 text-slate-900 border-amber-500' : 'bg-white/5 text-slate-400 hover:text-white border-white/5'}`;

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #080e1a 0%, #0b1525 60%, #080e1a 100%)' }}>
      <nav className="sticky top-0 z-50 border-b border-white/5" style={{ background: 'rgba(8,14,26,0.85)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <a href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-slate-900 font-black text-lg">⚡</div>
            <div className="hidden sm:block">
              <div className="text-white font-black text-base tracking-tight leading-none">ALPHA STAGE</div>
              <div className="text-amber-500 text-[8px] font-bold uppercase tracking-widest">Weinstein Terminal</div>
            </div>
          </a>
          <div className="flex items-center gap-2">
            <a href="/resultados" className="hidden sm:block text-slate-400 hover:text-white text-sm font-bold px-3 py-2">Resultados</a>
            <a href="/" className="px-4 sm:px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-sm rounded-xl">Empezar gratis →</a>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <header className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-xs font-black uppercase tracking-widest mb-5">
            <i className="fas fa-arrow-trend-up" /> Escaneo diario · gratis
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-white mb-4 leading-tight">
            Acciones en <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(90deg, #f59e0b, #fbbf24)' }}>Etapa 2</span> hoy
          </h1>
          <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto">
            Cada día, tras el cierre, analizamos 7 índices con las reglas de Stan Weinstein: precio sobre una MM30 semanal ascendente
            y fuerza relativa positiva. Estos son los valores en tendencia alcista.
          </p>
          {scanDate && (
            <p className="text-slate-500 text-sm mt-3">
              Escaneo del <strong className="text-slate-300">{fmtDate(scanDate)}</strong> · {uniqueCount} valores
              {prevKeys && <> · <span className="text-emerald-400">{newCount} nuevos</span></>}
            </p>
          )}
        </header>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
          <button className={chip(index === 'ALL')} onClick={() => setIndex('ALL')}>Todos · {uniqueCount}</button>
          {INDEX_ORDER.filter((i) => counts[i]).map((i) => (
            <button key={i} className={chip(index === i)} onClick={() => setIndex(i)}>{INDEX_LABEL[i]} · {counts[i]}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-6 text-xs">
          {prevKeys && (
            <button className={chip(onlyNew)} onClick={() => setOnlyNew(!onlyNew)}>
              <i className="fas fa-bolt mr-1" /> Solo nuevas hoy ({newCount})
            </button>
          )}
          {sectors.size > 0 && (
            <button className={chip(strongSectors)} onClick={() => setStrongSectors(!strongSectors)} title="Weinstein: los mejores valores de los mejores sectores">
              <i className="fas fa-layer-group mr-1" /> Solo sectores en Etapa 2
            </button>
          )}
          <span className="text-slate-500 font-bold ml-auto">Ordenar:</span>
          {([['rs', 'Fuerza relativa'], ['distance', 'Más cerca de la MM30'], ['volume', 'Volumen']] as const).map(([k, l]) => (
            <button key={k} className={chip(sort === k)} onClick={() => setSort(k)}>{l}</button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-24"><div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : visible.length === 0 ? (
          <p className="text-center text-slate-500 py-16">No hay valores con este filtro.</p>
        ) : (
          <div className="space-y-2">
            {visible.map((r) => (
              <div key={`${r.index_id}:${r.symbol}`} className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 sm:px-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                  <div className="min-w-0 sm:flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-black">{r.symbol}</span>
                      {isNew(r) && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">Nueva</span>}
                      {r.extended && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400" title="Más de un 15 % sobre la MM30: Weinstein no compra tan lejos">Extendida</span>}
                      <span className="text-[10px] text-slate-500 font-bold">{INDEX_LABEL[r.index_id] ?? r.index_id}</span>
                      {r.sector_etf && sectors.get(r.sector_etf) && (() => {
                        const sec = sectors.get(r.sector_etf!)!;
                        const color = sec.stage === 'STAGE_2' ? 'text-emerald-400 border-emerald-500/30' : sec.stage === 'STAGE_4' ? 'text-rose-400 border-rose-500/30' : sec.stage === 'STAGE_3' ? 'text-amber-400 border-amber-500/30' : 'text-slate-400 border-white/10';
                        return (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${color}`} title={`Sector en ${sec.stage.replace('STAGE_', 'Etapa ')} · puesto ${sec.rank} de su región`}>
                            {sec.name_es} · E{sec.stage.slice(-1)}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="text-slate-400 text-xs truncate">{r.name}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-x-3 gap-y-2 sm:flex sm:gap-6">
                  {[
                    { k: 'Precio', v: money(r.current_price, r.currency) },
                    { k: 'Sobre MM30', v: num(r.distance_pct, 1, '%') },
                    { k: 'Fuerza rel.', v: num(r.mansfield_rs, 1) },
                    { k: 'Volumen', v: r.volume_ratio == null ? '—' : `${r.volume_ratio.toFixed(1)}×` },
                    { k: 'Stop', v: r.stop_loss == null ? '—' : `${money(r.stop_loss, r.currency)}${r.stop_risk_pct != null ? ` (−${r.stop_risk_pct.toFixed(0)}%)` : ''}` },
                  ].map((c) => (
                    <div key={c.k} className={`text-xs sm:min-w-[70px] ${c.k === 'Stop' ? 'col-span-2' : ''}`}>
                      <div className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">{c.k}</div>
                      <div className="text-white font-bold">{c.v}</div>
                    </div>
                  ))}
                  </div>
                  <a
                    href={`/?analizar=${encodeURIComponent(r.symbol)}`}
                    className="sm:ml-auto shrink-0 text-center px-3.5 py-2 rounded-xl bg-white/5 hover:bg-amber-500 hover:text-slate-900 border border-white/10 text-amber-400 text-xs font-black transition-colors"
                  >
                    Analizar <i className="fas fa-arrow-right ml-1" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* How to read it */}
        <section className="mt-12 grid sm:grid-cols-3 gap-4 text-sm">
          {[
            { t: 'Sobre MM30', d: 'Cuánto está el precio por encima de su media de 30 semanas. Weinstein compra cerca de la ruptura; por encima de un 15 % el valor está extendido.' },
            { t: 'Fuerza relativa', d: 'Fuerza relativa de Mansfield frente a su índice. Positiva = lo hace mejor que el mercado, que es lo que busca Weinstein.' },
            { t: 'Volumen y stop', d: 'Volumen de la última semana frente a su media (una ruptura fiable suele venir con 2× o más) y el stop técnico sugerido.' },
          ].map((b) => (
            <div key={b.t} className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
              <div className="text-white font-bold mb-1">{b.t}</div>
              <p className="text-slate-400 leading-relaxed">{b.d}</p>
            </div>
          ))}
        </section>

        <div className="mt-10 rounded-3xl p-8 sm:p-10 text-center" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(251,191,36,0.05))', border: '1px solid rgba(245,158,11,0.2)' }}>
          <div className="text-2xl sm:text-3xl font-black text-white mb-3">¿Merece la pena entrar?</div>
          <p className="text-slate-400 mb-7 max-w-lg mx-auto">
            Estar en Etapa 2 no basta. El análisis completo revisa la base, el volumen de ruptura, el mercado y te da un plan con entrada y stop.
            3 análisis gratis al mes, sin tarjeta.
          </p>
          <a href="/" className="inline-flex items-center gap-3 px-8 py-4 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-lg rounded-2xl">
            <i className="fas fa-magnifying-glass-chart" /> Analizar gratis
          </a>
          <p className="text-slate-500 text-xs mt-5">
            ¿Funciona el método? Mira el <a href="/resultados" className="underline hover:text-slate-300">historial público de señales</a>, con las pérdidas incluidas.
          </p>
        </div>

        <footer className="mt-12 text-center text-slate-600 text-xs space-y-1">
          <p>Herramienta educativa basada en el método Weinstein. No es una recomendación de compra ni asesoramiento financiero.</p>
          <p>Datos de mercado proporcionados por Twelve Data · © 2026 Alpha Stage · <a href="/legal/terms" className="hover:text-slate-400">Términos</a> · <a href="/legal/privacy" className="hover:text-slate-400">Privacidad</a></p>
        </footer>
      </div>
    </div>
  );
};

export default StageTwoTodayPage;
