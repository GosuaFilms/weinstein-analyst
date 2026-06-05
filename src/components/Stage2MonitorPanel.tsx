import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stage2Row {
  scan_date:     string;
  index_id:      string;
  symbol:        string;
  name:          string;
  currency:      string;
  current_price: number | null;
  confidence:    'high' | 'medium' | 'low';
  sma30:         number | null;
  distance_pct:  number | null;
  mansfield_rs:  number | null;
  volume_ratio:  number | null;
  extended:      boolean;
  stop_loss:     number | null;
  stop_risk_pct: number | null;
}

type Filter = 'ALL' | 'NEW' | 'EXIT';

const CONF_COLOR: Record<string, string> = {
  high:   'bg-emerald-500',
  medium: 'bg-amber-400',
  low:    'bg-slate-400',
};

const CONF_LABEL: Record<string, string> = {
  high:   'Alta',
  medium: 'Media',
  low:    'Baja',
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onAnalyze: (symbol: string) => void;
  onClose:   () => void;
  isPro?:    boolean;
  onUpgrade?: () => void;
}

const Stage2MonitorPanel: React.FC<Props> = ({ onAnalyze, onClose, isPro = false, onUpgrade }) => {
  const [today,      setToday]      = useState<Stage2Row[]>([]);
  const [newEntries, setNewEntries] = useState<Set<string>>(new Set());
  const [exits,      setExits]      = useState<Stage2Row[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastDate,   setLastDate]   = useState<string | null>(null);
  const [filter,     setFilter]     = useState<Filter>('ALL');
  const [indexFilter, setIndexFilter] = useState<string>('ALL');
  const [error,      setError]      = useState<string | null>(null);

  // ── Load data from DB ──────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setError(null);
    try {
      // 1. Get the two most recent scan dates
      const { data: dates } = await supabase
        .from('stage2_snapshots')
        .select('scan_date')
        .order('scan_date', { ascending: false })
        .limit(200);

      if (!dates || dates.length === 0) {
        setLoading(false);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const uniqueDates = [...new Set((dates as any[]).map((d) => d.scan_date as string))].slice(0, 2);
      const latestDate   = uniqueDates[0];
      const previousDate = uniqueDates[1] ?? null;
      setLastDate(latestDate);

      // 2. Fetch today's Stage 2 list
      const { data: todayRaw, error: err1 } = await supabase
        .from('stage2_snapshots')
        .select('*')
        .eq('scan_date', latestDate);

      if (err1) throw err1;

      // Sort: high → medium → low, then by Mansfield RS descending
      const CONF_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
      const todayRows = ((todayRaw ?? []) as Stage2Row[]).sort((a, b) => {
        const confDiff = (CONF_ORDER[a.confidence] ?? 2) - (CONF_ORDER[b.confidence] ?? 2);
        if (confDiff !== 0) return confDiff;
        return (b.mansfield_rs ?? -99) - (a.mansfield_rs ?? -99);
      });
      setToday(todayRows);

      // 3. Fetch yesterday's list for diff
      if (previousDate) {
        const { data: prevRaw } = await supabase
          .from('stage2_snapshots')
          .select('symbol, index_id')
          .eq('scan_date', previousDate);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prevRows = (prevRaw ?? []) as any[];
        const prevSet  = new Set(prevRows.map((r) => `${r.index_id}:${r.symbol}`));
        const todaySet = new Set(todayRows.map(r => `${r.index_id}:${r.symbol}`));

        // New entries = in today but not yesterday
        const newSet = new Set(
          todayRows
            .filter(r => !prevSet.has(`${r.index_id}:${r.symbol}`))
            .map(r => `${r.index_id}:${r.symbol}`)
        );
        setNewEntries(newSet);

        // Exits = in yesterday but not today
        const exitSymbols = prevRows.filter((r) => !todaySet.has(`${r.index_id}:${r.symbol}`));
        if (exitSymbols.length > 0) {
          const { data: exitRaw } = await supabase
            .from('stage2_snapshots')
            .select('*')
            .eq('scan_date', previousDate)
            .in('symbol', exitSymbols.map((r) => r.symbol as string));
          setExits((exitRaw ?? []) as Stage2Row[]);
        } else {
          setExits([]);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Manual refresh (triggers edge function + reloads) ─────────────────────
  const handleRefresh = async () => {
    if (!isPro) { onUpgrade?.(); return; }
    setRefreshing(true);
    try {
      await supabase.functions.invoke('stage2-daily', {});
    } catch { /* ignore */ }
    await loadData();
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const allIndices = [...new Set(today.map(r => r.index_id))].sort();

  const filteredToday = today.filter(r => {
    if (indexFilter !== 'ALL' && r.index_id !== indexFilter) return false;
    if (filter === 'NEW')  return newEntries.has(`${r.index_id}:${r.symbol}`);
    if (filter === 'EXIT') return false;
    return true;
  });

  const filteredExits = filter === 'EXIT' || filter === 'ALL' ? exits : [];

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-6xl mx-4 my-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
              <i className="fas fa-arrow-trend-up text-emerald-500 text-lg" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Monitor Stage 2
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Lista diaria actualizada · {lastDate ?? '—'} ·{' '}
                <span className="text-emerald-500 font-bold">{today.length} acciones</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title={isPro ? 'Actualizar ahora' : 'Requiere plan Pro'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all disabled:opacity-50"
            >
              <i className={`fas fa-rotate ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Actualizando…' : 'Actualizar'}
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-2 transition-colors">
              <i className="fas fa-times text-xl" />
            </button>
          </div>
        </div>

        {/* ── Filter bar ──────────────────────────────────────────────────── */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-wrap gap-2 items-center">
          {/* Status filter */}
          <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
            {([
              { id: 'ALL',  label: `Todos (${today.length})`,           icon: 'fa-list' },
              { id: 'NEW',  label: `🆕 Nuevos (${newEntries.size})`,    icon: null },
              { id: 'EXIT', label: `📤 Salidas (${exits.length})`,       icon: null },
            ] as const).map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 text-xs font-bold transition-all ${
                  filter === f.id
                    ? 'bg-emerald-500 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Index filter */}
          <select
            value={indexFilter}
            onChange={e => setIndexFilter(e.target.value)}
            className="text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-2 py-1.5 focus:outline-none focus:border-emerald-400"
          >
            <option value="ALL">Todos los índices</option>
            {allIndices.map(idx => <option key={idx} value={idx}>{idx}</option>)}
          </select>

          {/* Legend */}
          <div className="ml-auto flex items-center gap-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Alta confianza</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Media</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400 inline-block" /> Baja</span>
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 240px)' }}>

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
              <i className="fas fa-circle-notch animate-spin text-3xl text-emerald-500" />
              <p className="font-bold">Cargando lista Stage 2…</p>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-600 dark:text-rose-400 text-sm flex items-center gap-3">
              <i className="fas fa-circle-exclamation" />
              {error}
            </div>
          )}

          {/* Empty state — no data yet */}
          {!loading && !error && today.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-slate-500">
              <i className="fas fa-database text-4xl mb-4 opacity-30" />
              <p className="font-bold text-slate-600 dark:text-slate-300 mb-1">Aún no hay datos</p>
              <p className="text-sm max-w-xs">
                El primer escaneo se ejecuta automáticamente cada día laboral a las 22:00 UTC.
                Puedes lanzarlo ahora manualmente (plan Pro).
              </p>
              {!isPro && (
                <button
                  onClick={onUpgrade}
                  className="mt-4 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black rounded-xl text-sm flex items-center gap-2"
                >
                  <i className="fas fa-crown" /> Activar Pro
                </button>
              )}
            </div>
          )}

          {/* ── Exits section ─────────────────────────────────────────────── */}
          {!loading && filteredExits.length > 0 && (filter === 'EXIT' || filter === 'ALL') && (
            <div className="mb-6">
              <h3 className="text-xs font-black uppercase tracking-widest text-rose-500 mb-3 flex items-center gap-2">
                <i className="fas fa-arrow-right-from-bracket" />
                Salidas de Stage 2 — {filteredExits.length} acción{filteredExits.length !== 1 ? 'es' : ''}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredExits.map(row => (
                  <div key={`exit-${row.index_id}-${row.symbol}`}
                    className="p-4 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-rose-500 text-white uppercase">
                        Salida · {row.index_id}
                      </span>
                    </div>
                    <div className="font-black text-sm text-slate-900 dark:text-white">{row.symbol}</div>
                    <div className="text-xs text-slate-500 truncate">{row.name}</div>
                    <button
                      onClick={() => { onAnalyze(row.symbol); onClose(); }}
                      className="mt-3 w-full py-1.5 bg-slate-800 dark:bg-white text-white dark:text-slate-900 font-bold rounded-lg text-xs hover:bg-slate-700 dark:hover:bg-slate-100 transition-all"
                    >
                      <i className="fas fa-chart-simple mr-1" /> Analizar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Stage 2 list ──────────────────────────────────────────────── */}
          {!loading && (filter === 'ALL' || filter === 'NEW') && filteredToday.length > 0 && (
            <>
              {filter === 'NEW' && newEntries.size > 0 && (
                <div className="mb-4 px-4 py-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl flex items-center gap-3">
                  <i className="fas fa-fire text-emerald-500 text-lg" />
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                    {newEntries.size} acción{newEntries.size !== 1 ? 'es' : ''} nueva{newEntries.size !== 1 ? 's' : ''} en Stage 2 hoy
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(isPro ? filteredToday : filteredToday.slice(0, 6)).map(row => {
                  const isNew = newEntries.has(`${row.index_id}:${row.symbol}`);
                  const distPos = row.distance_pct !== null && row.distance_pct > 0;
                  return (
                    <div
                      key={`${row.index_id}-${row.symbol}`}
                      className={`p-4 rounded-xl border transition-all hover:shadow-md ${
                        isNew
                          ? 'border-emerald-300 dark:border-emerald-500/50 bg-emerald-50 dark:bg-emerald-500/10 ring-1 ring-emerald-400/30'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60'
                      }`}
                    >
                      {/* Header badges */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-700 dark:bg-slate-600 text-white uppercase">
                            {row.index_id}
                          </span>
                          {isNew && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-500 text-white uppercase animate-pulse">
                              🆕 Nuevo
                            </span>
                          )}
                          {row.extended && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-400/30">
                              EXT
                            </span>
                          )}
                        </div>
                        {/* Confidence dots */}
                        <div className="flex items-center gap-1" title={`Confianza: ${CONF_LABEL[row.confidence]}`}>
                          {(['high', 'medium', 'low'] as const).map((lvl, i) => (
                            <div key={lvl} className={`w-2 h-2 rounded-full ${
                              (row.confidence === 'high') ||
                              (row.confidence === 'medium' && i >= 1) ||
                              (row.confidence === 'low' && i >= 2)
                                ? CONF_COLOR[row.confidence]
                                : 'bg-slate-200 dark:bg-slate-700'
                            }`} />
                          ))}
                        </div>
                      </div>

                      {/* Symbol + name */}
                      <div className="mb-3">
                        <div className="font-black text-sm text-slate-900 dark:text-white">{row.symbol}</div>
                        <div className="text-xs text-slate-500 truncate" title={row.name}>{row.name}</div>
                      </div>

                      {/* Metrics */}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mb-3">
                        {row.current_price !== null && (
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Precio</span>
                            <p className="font-bold text-slate-800 dark:text-slate-200">
                              {row.current_price.toFixed(2)} {row.currency}
                            </p>
                          </div>
                        )}
                        {row.sma30 !== null && (
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">SMA30</span>
                            <p className="font-bold text-slate-800 dark:text-slate-200">{row.sma30.toFixed(2)}</p>
                          </div>
                        )}
                        {row.distance_pct !== null && (
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Dist. SMA30</span>
                            <p className={`font-bold ${distPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                              {distPos ? '+' : ''}{row.distance_pct.toFixed(1)}%
                            </p>
                          </div>
                        )}
                        {row.mansfield_rs !== null && (
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">RS Mansfield</span>
                            <p className={`font-bold ${row.mansfield_rs >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                              {row.mansfield_rs.toFixed(2)}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Stop loss */}
                      {row.stop_loss !== null && (
                        <div className="mb-3 px-2 py-1.5 bg-slate-50 dark:bg-slate-900/40 rounded-lg flex justify-between text-xs">
                          <span className="text-slate-500 flex items-center gap-1">
                            <i className="fas fa-shield text-rose-400 text-[10px]" /> Stop
                          </span>
                          <span className="font-bold text-rose-500">
                            {row.stop_loss.toFixed(2)}
                            {row.stop_risk_pct !== null && (
                              <span className="ml-1 text-[10px] opacity-70">({row.stop_risk_pct.toFixed(1)}%)</span>
                            )}
                          </span>
                        </div>
                      )}

                      {/* Analyze button */}
                      <button
                        onClick={() => { onAnalyze(row.symbol); onClose(); }}
                        className="w-full py-2 bg-slate-800 dark:bg-white text-white dark:text-slate-900 font-bold rounded-lg text-xs hover:bg-slate-700 dark:hover:bg-slate-100 transition-all flex items-center justify-center gap-1.5"
                      >
                        <i className="fas fa-chart-simple" /> Analizar en detalle
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Pro paywall */}
              {!isPro && filteredToday.length > 6 && (
                <div className="mt-4 p-6 bg-gradient-to-b from-transparent to-white dark:to-slate-900 rounded-2xl border border-amber-500/30 text-center">
                  <i className="fas fa-lock text-amber-500 text-2xl mb-2 block" />
                  <p className="font-black text-slate-900 dark:text-white mb-1">
                    {filteredToday.length - 6} acciones más ocultas
                  </p>
                  <p className="text-sm text-slate-500 mb-4">Actualiza a Pro para ver la lista completa y las actualizaciones diarias automáticas.</p>
                  <button onClick={onUpgrade} className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black rounded-xl text-sm flex items-center gap-2 mx-auto">
                    <i className="fas fa-crown" /> Ver lista completa — Pro
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Stage2MonitorPanel;
