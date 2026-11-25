import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

// Public, automatic track record. Every row comes from the daily Stage 2 scan
// (table track_signals, written only by the stage2-daily function); nothing
// here is entered by hand. Rules are listed in METHOD below and must match
// supabase/functions/_shared/trackRecord.ts.

interface Signal {
  id: number;
  symbol: string;
  name: string;
  index_id: string;
  currency: string | null;
  confidence: string | null;
  entry_date: string;
  entry_price: number;
  stop_loss: number | null;
  benchmark_symbol: string | null;
  benchmark_entry: number | null;
  status: 'open' | 'closed';
  exit_date: string | null;
  exit_price: number | null;
  exit_reason: 'stage_exit' | 'stop' | null;
  benchmark_exit: number | null;
  last_date: string | null;
  last_price: number | null;
  benchmark_last: number | null;
  data_gap: boolean;
  volume_ratio: number | null;
}

interface Row extends Signal {
  ret: number;            // % return (closed: at exit; open: at last close)
  bench: number | null;   // index ETF % over the same days
  excess: number | null;  // ret − bench
  days: number;
}

type Filter = 'all' | 'open' | 'closed';

const INDEX_LABEL: Record<string, string> = {
  IBEX35: 'IBEX 35', SP100: 'S&P 100', NASDAQ50: 'NASDAQ', DAX40: 'DAX 40',
  CAC40: 'CAC 40', FTSE100: 'FTSE 100', EUROSTOXX50: 'Euro Stoxx 50',
};

const METHOD = [
  'Cada día laborable, tras el cierre, la app escanea 7 índices (IBEX 35, S&P 100, NASDAQ, DAX, CAC 40, FTSE 100 y Euro Stoxx 50) con las reglas de Weinstein.',
  'Señal = al cierre del viernes, un valor que está en Etapa 2 y no lo estaba el viernes anterior, con fuerza relativa de Mansfield positiva, sin estar extendido (menos de un 15 % sobre su MM30) y con su mercado fuera de Etapa 4. Se toma el cierre del viernes. Se anota el volumen de esa semana frente a su media, para medir si las rupturas con volumen (≥2×) funcionan mejor, como sostiene Weinstein.',
  'Salida = el primer cierre diario en o por debajo del stop inicial, o que el valor deje de estar en Etapa 2 al cierre semanal del viernes. Se toma el cierre de ese día.',
  'Cambio de reglas de salida el 26 nov 2026: hasta esa fecha, la salida por perder la Etapa 2 se tomaba en el primer escaneo diario fuera de Etapa 2; desde entonces se confirma con el cierre del viernes. Las señales cerradas antes no se han recalculado.',
  'Cambio de reglas de entrada el 27 nov 2026: hasta esa fecha, una señal se abría cualquier día en que el valor aparecía en Etapa 2 sin estar extendido, sin exigir fuerza relativa positiva ni mirar el mercado. Las señales abiertas antes se mantienen con sus reglas.',
  'Stop inicial = bajo el soporte: el mínimo de la base o de la última corrección (10 semanas) −2 %, como lo coloca Weinstein. Cambio el 26 nov 2026: antes se tomaba el más ajustado entre ese nivel y la MM30 −3 %, que saltaba con retrocesos normales. Las señales abiertas antes mantienen su stop.',
  'Cada señal se compara con el ETF de su índice durante los mismos días.',
  'Sin comisiones, deslizamiento ni dividendos. Las señales abiertas se valoran al último cierre.',
];

const pct = (v: number | null, digits = 1) =>
  v === null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;

function money(v: number | null, currency: string | null) {
  if (v === null) return '—';
  if (currency === 'GBp' || currency === 'GBX') return `${v.toFixed(1)} p`;
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency ?? ''}`;
  }
}

const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const TrackRecordPage: React.FC = () => {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [showMethod, setShowMethod] = useState(false);

  useEffect(() => {
    supabase
      .from('track_signals')
      .select('*')
      .order('entry_date', { ascending: false })
      .order('symbol')
      .then(({ data }) => { setSignals((data as Signal[]) || []); setLoading(false); });
  }, []);

  const rows: Row[] = useMemo(() => signals.map((s) => {
    const price = s.status === 'closed' ? s.exit_price : s.last_price;
    const benchEnd = s.status === 'closed' ? s.benchmark_exit : s.benchmark_last;
    const ret = price ? (price / s.entry_price - 1) * 100 : 0;
    const bench = benchEnd && s.benchmark_entry ? (benchEnd / s.benchmark_entry - 1) * 100 : null;
    const end = s.exit_date ?? s.last_date ?? s.entry_date;
    return {
      ...s, ret, bench,
      excess: bench === null ? null : ret - bench,
      days: Math.round((Date.parse(end) - Date.parse(s.entry_date)) / 86_400_000),
    };
  }), [signals]);

  const closed = rows.filter((r) => r.status === 'closed');
  const open = rows.filter((r) => r.status === 'open');
  const winners = closed.filter((r) => r.ret > 0);
  const since = rows.length ? rows.reduce((m, r) => (r.entry_date < m ? r.entry_date : m), rows[0].entry_date) : null;
  const lastUpdate = rows.reduce<string | null>((m, r) => (r.last_date && (!m || r.last_date > m) ? r.last_date : m), null);

  const stats = [
    { value: String(rows.length), label: 'Señales', sub: since ? `desde el ${fmtDate(since)}` : '—', color: 'text-blue-400' },
    { value: pct(avg(rows.map((r) => r.ret))), label: 'Resultado medio', sub: 'por señal, cerradas y abiertas', color: (avg(rows.map((r) => r.ret)) ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400' },
    { value: pct(avg(rows.filter((r) => r.excess !== null).map((r) => r.excess as number))), label: 'Frente al índice', sub: 'diferencia media con su ETF', color: (avg(rows.filter((r) => r.excess !== null).map((r) => r.excess as number)) ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400' },
    { value: closed.length ? `${Math.round((winners.length / closed.length) * 100)}%` : '—', label: 'Cerradas en positivo', sub: `${winners.length} de ${closed.length} cerradas`, color: 'text-amber-400' },
  ];

  const withVol = rows.filter((r) => r.volume_ratio != null);
  const volHi = withVol.filter((r) => (r.volume_ratio as number) >= 2);
  const volLo = withVol.filter((r) => (r.volume_ratio as number) < 2);

  const visible = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
  const FILTERS: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'Todas', count: rows.length },
    { id: 'open', label: 'Abiertas', count: open.length },
    { id: 'closed', label: 'Cerradas', count: closed.length },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #080e1a 0%, #0b1525 60%, #080e1a 100%)' }}>

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 border-b border-white/5" style={{ background: 'rgba(8,14,26,0.85)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-slate-900 font-black text-lg">⚡</div>
            <div>
              <div className="text-white font-black text-base tracking-tight leading-none">ALPHA STAGE</div>
              <div className="text-amber-500 text-[8px] font-bold uppercase tracking-widest">Weinstein Terminal</div>
            </div>
          </a>
          <div className="flex items-center gap-2">
            <a href="/etapa-2" className="hidden sm:block text-slate-400 hover:text-white text-sm font-bold px-3 py-2">Etapa 2 hoy</a>
            <a href="/" className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-sm rounded-xl transition-all">
              Empezar gratis →
            </a>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">

        {/* ── Header ── */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-xs font-black uppercase tracking-widest mb-6">
            <i className="fas fa-robot" /> Registro automático, sin selección manual
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-4 leading-tight">
            Historial de señales<br />
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(90deg, #f59e0b, #fbbf24)' }}>
              Etapa 2 de Weinstein
            </span>
          </h1>
          <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto">
            Todas las entradas en Etapa 2 que detecta el escaneo diario, con sus pérdidas incluidas.
            Nadie elige qué se muestra: cada señal se abre y se cierra sola según reglas fijas.
          </p>
          {lastUpdate && <p className="text-slate-600 text-xs mt-3">Actualizado con el cierre del {fmtDate(lastUpdate)}</p>}
          <p className="text-slate-500 text-xs mt-1">
            Reglas actualizadas: desde el 26 nov 2026 las salidas, y desde el 27 nov 2026 las entradas, se confirman con el cierre del viernes; las entradas exigen además fuerza relativa positiva y mercado fuera de Etapa 4.{' '}
            <button onClick={() => setShowMethod(true)} className="underline hover:text-slate-300">Ver reglas</button>
          </p>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
          {stats.map(({ value, label, sub, color }) => (
            <div key={label} className="rounded-2xl border border-white/5 p-5 text-center bg-white/[0.02]">
              <div className={`text-2xl sm:text-3xl font-black ${color} mb-1`}>{loading ? '…' : value}</div>
              <div className="text-white text-sm font-bold">{label}</div>
              <div className="text-slate-500 text-xs mt-0.5">{sub}</div>
            </div>
          ))}
        </div>

        {withVol.length > 0 && (
          <div className="mb-8 rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-4 text-sm text-slate-400">
            <span className="text-white font-bold">¿Importa el volumen?</span>{' '}
            Rupturas con volumen ≥2×: <strong className="text-white">{volHi.length}</strong> señales, resultado medio <strong className="text-white">{pct(avg(volHi.map((r) => r.ret)))}</strong>.
            {' '}Sin ese volumen: <strong className="text-white">{volLo.length}</strong>, resultado medio <strong className="text-white">{pct(avg(volLo.map((r) => r.ret)))}</strong>.
            <span className="text-slate-500"> Solo señales desde el 27 nov 2026.</span>
          </div>
        )}

        {/* ── Method ── */}
        <div className="mb-8 rounded-2xl border border-white/5 bg-white/[0.02]">
          <button onClick={() => setShowMethod(!showMethod)} className="w-full flex items-center justify-between px-5 py-4 text-left">
            <span className="text-white text-sm font-bold"><i className="fas fa-ruler-combined text-amber-500 mr-2" />Cómo se generan las señales</span>
            <i className={`fas fa-chevron-down text-slate-500 transition-transform ${showMethod ? 'rotate-180' : ''}`} />
          </button>
          {showMethod && (
            <ul className="px-5 pb-5 space-y-2 text-slate-400 text-sm leading-relaxed list-disc list-inside">
              {METHOD.map((m) => <li key={m}>{m}</li>)}
            </ul>
          )}
        </div>

        <div className="mb-8 flex items-start gap-3 px-5 py-4 bg-amber-500/5 border border-amber-500/15 rounded-2xl">
          <i className="fas fa-triangle-exclamation text-amber-500 text-sm mt-0.5 shrink-0" />
          <p className="text-amber-200/60 text-xs leading-relaxed">
            <strong>Aviso:</strong> herramienta educativa. Son señales simuladas sobre precios de cierre, no operaciones reales ni recomendaciones de inversión.
            El historial es corto y la rentabilidad pasada no garantiza resultados futuros.
          </p>
        </div>

        {/* ── Filters ── */}
        <div className="flex items-center gap-2 mb-5 overflow-x-auto">
          {FILTERS.map(({ id, label, count }) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`shrink-0 px-5 py-2.5 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${
                filter === id ? 'bg-amber-500 text-slate-900' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/5'
              }`}
            >
              {label}
              <span className={`text-xs px-2 py-0.5 rounded-full ${filter === id ? 'bg-slate-900/20 text-slate-900' : 'bg-white/10 text-slate-500'}`}>{count}</span>
            </button>
          ))}
        </div>

        {/* ── Signals ── */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <p className="text-center text-slate-500 py-16">Todavía no hay señales en esta categoría.</p>
        ) : (
          <div className="space-y-2">
            {visible.map((r) => {
              const isOpen = r.status === 'open';
              const badge = isOpen
                ? { label: 'Abierta', cls: 'bg-blue-500/15 border-blue-500/30 text-blue-400' }
                : r.exit_reason === 'stop'
                  ? { label: 'Stop', cls: 'bg-rose-500/15 border-rose-500/30 text-rose-400' }
                  : { label: 'Salió de Etapa 2', cls: 'bg-slate-500/15 border-slate-500/30 text-slate-300' };
              return (
                <div key={r.id} className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <div className="min-w-0 flex-1 basis-56">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-black">{r.symbol}</span>
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
                        <span className="text-[10px] text-slate-500 font-bold">{INDEX_LABEL[r.index_id] ?? r.index_id}</span>
                        {r.volume_ratio != null && (
                          <span
                            title="Volumen de la semana de entrada frente a su media de 30 semanas"
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${r.volume_ratio >= 2 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'border-white/10 text-slate-500'}`}
                          >
                            Vol. {r.volume_ratio.toFixed(1)}×
                          </span>
                        )}
                      </div>
                      <div className="text-slate-400 text-xs truncate">{r.name}</div>
                    </div>
                    <div className="text-xs">
                      <div className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Entrada</div>
                      <div className="text-white font-bold">{money(r.entry_price, r.currency)}</div>
                      <div className="text-slate-500">{fmtDate(r.entry_date)}</div>
                    </div>
                    <div className="text-xs">
                      <div className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">{isOpen ? 'Último cierre' : 'Salida'}</div>
                      <div className="text-white font-bold">{money(isOpen ? r.last_price : r.exit_price, r.currency)}</div>
                      <div className="text-slate-500">{fmtDate((isOpen ? r.last_date : r.exit_date) ?? r.entry_date)} · {r.days} d</div>
                    </div>
                    <div className="text-right min-w-[96px] ml-auto">
                      <div className={`text-lg font-black ${r.ret >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{pct(r.ret)}</div>
                      <div className="text-slate-500 text-[11px]" title={r.benchmark_symbol ? `Índice: ${r.benchmark_symbol} ${pct(r.bench)}` : undefined}>
                        vs índice {pct(r.excess)}
                      </div>
                    </div>
                  </div>
                  {r.data_gap && (
                    <p className="text-[11px] text-amber-300/60 mt-2">
                      <i className="fas fa-circle-info mr-1" />
                      El escaneo estuvo parado unos días antes de esta salida: se cerró en el primer escaneo posterior.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── CTA ── */}
        <div className="mt-14 rounded-3xl p-8 sm:p-10 text-center" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(251,191,36,0.05))', border: '1px solid rgba(245,158,11,0.2)' }}>
          <div className="text-2xl sm:text-3xl font-black text-white mb-3">Analiza cualquier valor con el mismo método</div>
          <p className="text-slate-400 mb-8 max-w-md mx-auto">Etapa, MM30, fuerza relativa de Mansfield, volumen y un plan con entrada y stop.</p>
          <a href="/" className="inline-flex items-center gap-3 px-8 py-4 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-lg rounded-2xl transition-all">
            <i className="fas fa-rocket" /> Empezar gratis
          </a>
        </div>

        <div className="mt-12 text-center text-slate-600 text-xs">
          <p>© 2026 Alpha Stage Terminal · <a href="/" className="hover:text-slate-400 transition-colors">alphastage.finance</a></p>
          <p className="mt-1">Datos de mercado proporcionados por Twelve Data. Solo uso educativo.</p>
        </div>
      </div>
    </div>
  );
};

export default TrackRecordPage;
