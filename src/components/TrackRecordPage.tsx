import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Signal {
  id: string;
  ticker: string;
  company_name: string;
  market: string;
  signal_date: string;
  stage: string;
  entry_price: number;
  stop_loss: number | null;
  target_price: number | null;
  exit_price: number | null;
  exit_date: string | null;
  current_price: number | null;
  pnl_pct: number | null;
  holding_days: number | null;
  status: 'open' | 'won' | 'lost' | 'closed';
  currency: string;
  notes: string | null;
}

type Filter = 'all' | 'won' | 'lost' | 'open';

const STATUS_CONFIG = {
  won:    { label: 'Ganada',   bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400', dot: 'bg-emerald-400', icon: 'fa-trophy' },
  lost:   { label: 'Parada',   bg: 'bg-rose-500/15',    border: 'border-rose-500/30',    text: 'text-rose-400',    dot: 'bg-rose-400',    icon: 'fa-shield-halved' },
  open:   { label: 'Abierta',  bg: 'bg-blue-500/15',    border: 'border-blue-500/30',    text: 'text-blue-400',    dot: 'bg-blue-400',    icon: 'fa-circle-dot' },
  closed: { label: 'Cerrada',  bg: 'bg-slate-500/15',   border: 'border-slate-500/30',   text: 'text-slate-400',   dot: 'bg-slate-400',   icon: 'fa-circle-xmark' },
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all',  label: 'Todas' },
  { id: 'won',  label: 'Ganadas' },
  { id: 'lost', label: 'Paradas' },
  { id: 'open', label: 'Abiertas' },
];

function fmt(price: number | null, currency: string) {
  if (price === null) return '—';
  const sym = currency === 'EUR' ? '€' : '$';
  return `${sym}${price.toFixed(2)}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

const TrackRecordPage: React.FC = () => {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('public_signals')
      .select('*')
      .order('signal_date', { ascending: false })
      .then(({ data }) => { setSignals((data as Signal[]) || []); setLoading(false); });
  }, []);

  const closed = signals.filter(s => s.status === 'won' || s.status === 'lost');
  const won = signals.filter(s => s.status === 'won');
  const winRate = closed.length ? Math.round((won.length / closed.length) * 100) : 0;
  const avgWin = won.length
    ? (won.reduce((acc, s) => acc + (s.pnl_pct ?? 0), 0) / won.length).toFixed(1)
    : '—';
  const openCount = signals.filter(s => s.status === 'open').length;
  const totalSignals = signals.length;

  const visible = filter === 'all' ? signals : signals.filter(s => s.status === filter);

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #080e1a 0%, #0b1525 60%, #080e1a 100%)' }}>

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 border-b border-white/5" style={{ background: 'rgba(8,14,26,0.85)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-slate-900 font-black text-lg">⚡</div>
            <div>
              <div className="text-white font-black text-base tracking-tight leading-none">ALPHA STAGE</div>
              <div className="text-amber-500 text-[8px] font-bold uppercase tracking-widest">Weinstein Terminal</div>
            </div>
          </a>
          <a
            href="/"
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-sm rounded-xl transition-all shadow-lg shadow-amber-500/20 hover:scale-105"
          >
            Empezar gratis →
          </a>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-16">

        {/* ── Header ── */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-xs font-black uppercase tracking-widest mb-6">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
            Señales reales generadas en la app
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-4 leading-tight">
            Historial de señales<br />
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(90deg, #f59e0b, #fbbf24)' }}>
              Método Weinstein
            </span>
          </h1>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            Señales Stage 2 reales generadas con la app. Sin retoques, con stops y errores incluidos.
          </p>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12">
          {[
            { value: `${winRate}%`, label: 'Tasa de acierto', sub: `${won.length} de ${closed.length} cerradas`, color: 'text-emerald-400', glow: 'rgba(16,185,129,0.1)' },
            { value: `+${avgWin}%`, label: 'Media de ganadora', sub: 'en operaciones ganadoras', color: 'text-amber-400', glow: 'rgba(245,158,11,0.1)' },
            { value: totalSignals, label: 'Señales totales', sub: 'desde el lanzamiento', color: 'text-blue-400', glow: 'rgba(59,130,246,0.1)' },
            { value: openCount, label: 'Abiertas ahora', sub: 'en seguimiento activo', color: 'text-violet-400', glow: 'rgba(139,92,246,0.1)' },
          ].map(({ value, label, sub, color, glow }) => (
            <div key={label} className="rounded-2xl border border-white/5 p-6 text-center" style={{ background: glow }}>
              <div className={`text-3xl font-black ${color} mb-1`}>{value}</div>
              <div className="text-white text-sm font-bold">{label}</div>
              <div className="text-slate-500 text-xs mt-0.5">{sub}</div>
            </div>
          ))}
        </div>

        {/* ── Disclaimer ── */}
        <div className="mb-8 flex items-start gap-3 px-5 py-4 bg-amber-500/5 border border-amber-500/15 rounded-2xl">
          <i className="fas fa-triangle-exclamation text-amber-500 text-sm mt-0.5 shrink-0" />
          <p className="text-amber-200/60 text-xs leading-relaxed">
            <strong>Aviso legal:</strong> Las señales mostradas son históricas y educativas. La rentabilidad pasada no garantiza resultados futuros. Esto no es asesoramiento financiero. Invierte siempre con gestión de riesgo adecuada.
          </p>
        </div>

        {/* ── Filter tabs ── */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto">
          {FILTERS.map(({ id, label }) => {
            const count = id === 'all' ? signals.length : signals.filter(s => s.status === id).length;
            return (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`shrink-0 px-5 py-2.5 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${
                  filter === id
                    ? 'bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/20'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/5'
                }`}
              >
                {label}
                <span className={`text-xs px-2 py-0.5 rounded-full ${filter === id ? 'bg-slate-900/20 text-slate-900' : 'bg-white/10 text-slate-500'}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* ── Signal cards ── */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {visible.map(signal => {
              const cfg = STATUS_CONFIG[signal.status];
              const isOpen = signal.status === 'open';
              const isExpanded = expanded === signal.id;
              const pnlColor = (signal.pnl_pct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400';
              const pnlBg = (signal.pnl_pct ?? 0) >= 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10';

              return (
                <div
                  key={signal.id}
                  className="rounded-2xl border border-white/5 overflow-hidden transition-all"
                  style={{ background: 'rgba(255,255,255,0.02)' }}
                >
                  {/* Main row */}
                  <button
                    className="w-full text-left p-5 sm:p-6"
                    onClick={() => setExpanded(isExpanded ? null : signal.id)}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">

                      {/* Left: ticker + info */}
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        {/* Ticker pill */}
                        <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                          <span className="text-white font-black text-sm">{signal.ticker.replace('-B','').replace('.MC','').slice(0,4)}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-black text-lg">{signal.ticker}</span>
                            <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.text} flex items-center gap-1.5`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${isOpen ? 'animate-pulse' : ''}`} />
                              {cfg.label}
                            </span>
                            <span className="text-[10px] text-slate-500 font-bold">{signal.market}</span>
                          </div>
                          <div className="text-slate-400 text-sm truncate">{signal.company_name}</div>
                          <div className="text-slate-600 text-xs mt-0.5">{fmtDate(signal.signal_date)}</div>
                        </div>
                      </div>

                      {/* Center: prices */}
                      <div className="flex items-center gap-6 text-sm">
                        <div>
                          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-0.5">Entrada</div>
                          <div className="text-white font-bold">{fmt(signal.entry_price, signal.currency)}</div>
                        </div>
                        <i className="fas fa-arrow-right text-slate-700 text-xs" />
                        <div>
                          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-0.5">
                            {isOpen ? 'Objetivo' : 'Salida'}
                          </div>
                          <div className="text-white font-bold">
                            {isOpen ? fmt(signal.target_price, signal.currency) : fmt(signal.exit_price, signal.currency)}
                          </div>
                        </div>
                      </div>

                      {/* Right: P&L */}
                      <div className="flex items-center gap-4 shrink-0">
                        {signal.pnl_pct !== null ? (
                          <div className={`px-4 py-2 rounded-xl ${pnlBg} text-center min-w-[80px]`}>
                            <div className={`text-xl font-black ${pnlColor}`}>
                              {signal.pnl_pct > 0 ? '+' : ''}{signal.pnl_pct.toFixed(1)}%
                            </div>
                            {signal.holding_days && (
                              <div className="text-slate-500 text-[10px] font-bold">{signal.holding_days}d</div>
                            )}
                          </div>
                        ) : (
                          <div className="px-4 py-2 rounded-xl bg-blue-500/10 text-center min-w-[80px]">
                            <div className="text-blue-400 text-sm font-black">EN CURSO</div>
                            <div className="text-slate-500 text-[10px] font-bold">Abierta</div>
                          </div>
                        )}
                        <i className={`fas fa-chevron-down text-slate-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-5 sm:px-6 pb-6 border-t border-white/5 pt-5">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                        {[
                          { label: 'Stage', value: signal.stage },
                          { label: 'Stop Loss', value: fmt(signal.stop_loss, signal.currency) },
                          { label: 'Objetivo', value: fmt(signal.target_price, signal.currency) },
                          { label: 'Salida', value: signal.exit_date ? fmtDate(signal.exit_date) : '—' },
                        ].map(({ label, value }) => (
                          <div key={label} className="bg-white/5 rounded-xl p-3">
                            <div className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">{label}</div>
                            <div className="text-white text-sm font-bold">{value}</div>
                          </div>
                        ))}
                      </div>
                      {signal.notes && (
                        <div className="bg-white/3 border border-white/5 rounded-xl p-4 mb-4">
                          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1.5">
                            <i className="fas fa-note-sticky mr-1.5" />Nota del analista
                          </div>
                          <p className="text-slate-300 text-sm leading-relaxed">{signal.notes}</p>
                        </div>
                      )}
                      <a
                        href="/"
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-sm rounded-xl transition-all"
                      >
                        <i className="fas fa-magnifying-glass-chart" />
                        Analizar {signal.ticker} ahora
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── CTA banner ── */}
        <div className="mt-16 rounded-3xl p-10 text-center" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(251,191,36,0.05))', border: '1px solid rgba(245,158,11,0.2)' }}>
          <div className="text-3xl font-black text-white mb-3">
            ¿Quieres identificar el próximo Stage 2?
          </div>
          <p className="text-slate-400 mb-8 max-w-md mx-auto">
            Analiza cualquier activo gratis con el mismo método que generó estas señales.
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-3 px-10 py-4 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-lg rounded-2xl transition-all shadow-2xl shadow-amber-500/30 hover:scale-105"
          >
            <i className="fas fa-rocket" />
            Empezar gratis — es 100% gratis
          </a>
        </div>

        {/* ── Footer ── */}
        <div className="mt-12 text-center text-slate-600 text-xs">
          <p>© 2026 Alpha Stage Terminal · <a href="/" className="hover:text-slate-400 transition-colors">alphastage.finance</a></p>
          <p className="mt-1">La rentabilidad pasada no es indicativa de resultados futuros. Solo uso educativo.</p>
        </div>
      </div>
    </div>
  );
};

export default TrackRecordPage;
