import React, { useState, useCallback, useEffect } from 'react';
import type { WatchlistItem } from '../hooks/useWatchlist';
import { AlertCondition, ALERT_CONDITION_LABELS } from '../types';
import { supabase } from '../lib/supabase';

// ─── Alert types ──────────────────────────────────────────────────────────────

type AlertLevel =
  | 'RUPTURA' | 'EN_TENDENCIA' | 'EXTENDIDA'
  | 'CERCA' | 'VIGILAR' | 'BASE'
  | 'PRECAUCION' | 'SALIDA';

interface ScannedItem {
  symbol: string;
  name: string;
  currency: string;
  currentPrice: number;
  stage: 'STAGE_1' | 'STAGE_2' | 'STAGE_3' | 'STAGE_4';
  confidence: 'low' | 'medium' | 'high';
  alert: AlertLevel;
  distanceFromSMA30Pct: number | null;
  mansfieldRS: number | null;
  suggestedStopLoss: number | null;
  stopLossRiskPct: number | null;
  atr14Weekly: number | null;
  volumeDryUp: boolean | null;
  multiMaAlignment: string | null;
  error?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const ALERT_CFG: Record<AlertLevel, { emoji: string; label: string; pill: string }> = {
  RUPTURA:      { emoji: '🚀', label: 'RUPTURA',    pill: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' },
  EN_TENDENCIA: { emoji: '✅', label: 'TENDENCIA',  pill: 'bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-700' },
  EXTENDIDA:    { emoji: '⚠️', label: 'EXTENDIDA',  pill: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700' },
  CERCA:        { emoji: '👀', label: 'CERCA',      pill: 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700' },
  VIGILAR:      { emoji: '📌', label: 'VIGILAR',    pill: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700' },
  BASE:         { emoji: '⏳', label: 'BASE',       pill: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600' },
  PRECAUCION:   { emoji: '🔶', label: 'PRECAUCIÓN', pill: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700' },
  SALIDA:       { emoji: '🔴', label: 'SALIDA',     pill: 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700' },
};

const STAGE_PILL: Record<string, string> = {
  STAGE_1: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
  STAGE_2: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  STAGE_3: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  STAGE_4: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300',
};

const STAGE_LABEL: Record<string, string> = {
  STAGE_1: 'E1', STAGE_2: 'E2', STAGE_3: 'E3', STAGE_4: 'E4',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  watchlist: WatchlistItem[];
  loading: boolean;
  onAnalyze: (symbol: string) => void;
  onAddAlert: (ticker: string, condition: AlertCondition) => Promise<void> | void;
  onRemove: (id: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const WatchlistSidebar: React.FC<Props> = ({
  isOpen, onClose, watchlist, loading, onAnalyze, onAddAlert, onRemove,
}) => {
  const [alertTicker, setAlertTicker] = useState<string | null>(null);
  const [alertCondition, setAlertCondition] = useState<AlertCondition>(AlertCondition.PRICE_CROSS_SMA30_UP);
  const [alertSubmitting, setAlertSubmitting] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);

  const [scanData, setScanData] = useState<Record<string, ScannedItem>>({});
  const [scanning, setScanning] = useState(false);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const scanWatchlist = useCallback(async () => {
    if (!watchlist.length || scanning) return;
    setScanning(true);
    setScanError(null);
    try {
      const { data, error } = await supabase.functions.invoke('watchlist-scan', {
        body: { symbols: watchlist.map(w => w.symbol) },
      });
      if (error) throw error;
      const map: Record<string, ScannedItem> = {};
      for (const item of (data.items as ScannedItem[])) map[item.symbol] = item;
      setScanData(map);
      setScannedAt(data.scannedAt);
    } catch (e) {
      setScanError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }, [watchlist, scanning]);

  // Auto-scan on first open if watchlist has items
  useEffect(() => {
    if (isOpen && watchlist.length > 0 && !scannedAt && !scanning) {
      scanWatchlist();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, watchlist.length]);

  if (!isOpen) return null;

  const handleAddAlert = async () => {
    if (!alertTicker) return;
    setAlertSubmitting(true);
    setAlertError(null);
    try {
      await onAddAlert(alertTicker, alertCondition);
      setAlertTicker(null);
    } catch (e) {
      setAlertError((e as Error).message);
    } finally {
      setAlertSubmitting(false);
    }
  };

  // Merge watchlist order with scan data, sorted by alert urgency when available
  const displayItems = [...watchlist].sort((a, b) => {
    const sa = scanData[a.symbol];
    const sb = scanData[b.symbol];
    if (!sa || !sb) return 0;
    const order: Record<AlertLevel, number> = {
      RUPTURA: 0, CERCA: 1, VIGILAR: 2, EN_TENDENCIA: 3,
      EXTENDIDA: 4, BASE: 5, PRECAUCION: 6, SALIDA: 7,
    };
    return order[sa.alert] - order[sb.alert];
  });

  const hasScanData = Object.keys(scanData).length > 0;

  return (
    <div className="fixed inset-0 z-[120] flex justify-end">
      <div className="absolute inset-0 bg-slate-950/20 dark:bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">

        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <i className="fas fa-star text-amber-400 text-base"></i> Watchlist
                {watchlist.length > 0 && (
                  <span className="text-xs font-black bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">
                    {watchlist.length}
                  </span>
                )}
              </h3>
              {scannedAt && (
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Escaneado {new Date(scannedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {watchlist.length > 0 && (
                <button
                  onClick={scanWatchlist}
                  disabled={scanning}
                  title="Actualizar datos en tiempo real"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 rounded-lg text-xs font-bold hover:bg-emerald-200 dark:hover:bg-emerald-800 transition-all disabled:opacity-50"
                >
                  <i className={`fas fa-rotate ${scanning ? 'animate-spin' : ''}`}></i>
                  {scanning ? 'Escaneando…' : 'Actualizar'}
                </button>
              )}
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                <i className="fas fa-times text-lg"></i>
              </button>
            </div>
          </div>

          {scanError && (
            <p className="mt-2 text-xs text-rose-500 flex items-center gap-1">
              <i className="fas fa-triangle-exclamation"></i> {scanError}
            </p>
          )}
        </div>

        {/* Alert mini-form */}
        {alertTicker && (
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-amber-50 dark:bg-amber-900/20">
            <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-2 uppercase tracking-wider">
              Nueva alerta — {alertTicker}
            </p>
            <select
              className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm mb-2 outline-none"
              value={alertCondition}
              onChange={e => setAlertCondition(e.target.value as AlertCondition)}
            >
              {Object.values(AlertCondition).map(c => (
                <option key={c} value={c}>{ALERT_CONDITION_LABELS[c]}</option>
              ))}
            </select>
            {alertError && <p className="text-xs text-rose-600 mb-2">{alertError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleAddAlert}
                disabled={alertSubmitting}
                className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-lg text-xs transition-all disabled:opacity-50"
              >
                {alertSubmitting ? 'Añadiendo…' : 'Añadir alerta'}
              </button>
              <button
                onClick={() => { setAlertTicker(null); setAlertError(null); }}
                className="py-2 px-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="flex-grow overflow-y-auto p-4 space-y-3">

          {/* Loading state (initial DB fetch) */}
          {loading && (
            <div className="flex justify-center pt-8">
              <i className="fas fa-circle-notch animate-spin text-slate-400 text-2xl"></i>
            </div>
          )}

          {/* Empty state */}
          {!loading && watchlist.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
              <i className="fas fa-star text-4xl mb-4"></i>
              <p className="text-sm font-semibold">Tu watchlist está vacía</p>
              <p className="text-xs mt-1">Analiza un activo y pulsa ⭐ para añadirlo aquí.</p>
            </div>
          )}

          {/* Scanning skeleton */}
          {scanning && watchlist.length > 0 && !hasScanData && (
            <div className="space-y-3">
              {watchlist.map(item => (
                <div key={item.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 animate-pulse">
                  <div className="flex justify-between items-start mb-2">
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-20" />
                      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-32" />
                    </div>
                    <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-20" />
                  </div>
                  <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full mt-2" />
                </div>
              ))}
            </div>
          )}

          {/* Items with scan data */}
          {!loading && displayItems.map(item => {
            const scan = scanData[item.symbol];
            const alert = scan ? ALERT_CFG[scan.alert] : null;
            const stageClass = scan ? STAGE_PILL[scan.stage] : '';
            const dist = scan?.distanceFromSMA30Pct;
            const distSign = dist != null ? (dist >= 0 ? '+' : '') : '';
            const distColor = dist == null ? '' : dist >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500';

            return (
              <div
                key={item.id}
                className={`bg-white dark:bg-slate-800 border rounded-xl p-4 transition-all group ${
                  scan?.alert === 'RUPTURA'
                    ? 'border-emerald-300 dark:border-emerald-700 shadow-sm shadow-emerald-500/10'
                    : scan?.alert === 'CERCA'
                    ? 'border-orange-200 dark:border-orange-800'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                {/* Row 1: Symbol + Stage + Alert */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    <span className="text-xs font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded">
                      {item.symbol}
                    </span>
                    {scan && !scan.error && (
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${stageClass}`}>
                        {STAGE_LABEL[scan.stage]}
                      </span>
                    )}
                    {scan?.volumeDryUp && (
                      <span title="Volumen en contracción — posible ruptura inminente" className="text-[10px] text-violet-600 dark:text-violet-400 font-bold">⚡</span>
                    )}
                  </div>
                  {alert && (
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0 ${alert.pill}`}>
                      {alert.emoji} {alert.label}
                    </span>
                  )}
                  {scanning && !scan && (
                    <span className="text-[10px] text-slate-400 animate-pulse">escaneando…</span>
                  )}
                </div>

                {/* Name */}
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate mb-2">
                  {scan?.name ?? item.name ?? item.symbol}
                </p>

                {/* Row 2: Metrics */}
                {scan && !scan.error && (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] mb-3">
                    <div className="text-slate-600 dark:text-slate-400">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {scan.currency === 'USD' ? '$' : scan.currency + ' '}
                        {scan.currentPrice.toLocaleString('es-ES', { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className={`font-bold ${distColor}`}>
                      {dist != null ? `${distSign}${dist.toFixed(1)}% MM30` : ''}
                    </div>
                    {scan.mansfieldRS != null && (
                      <div className="text-slate-500 dark:text-slate-400">
                        RS <span className={`font-bold ${scan.mansfieldRS >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                          {scan.mansfieldRS >= 0 ? '+' : ''}{scan.mansfieldRS.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {scan.suggestedStopLoss != null && (
                      <div className="text-slate-500 dark:text-slate-400">
                        Stop <span className="font-bold text-slate-700 dark:text-slate-300">
                          {scan.suggestedStopLoss.toLocaleString('es-ES', { maximumFractionDigits: 2 })}
                        </span>
                        {scan.stopLossRiskPct != null && (
                          <span className="text-rose-500 ml-1">−{scan.stopLossRiskPct.toFixed(1)}%</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Scan error */}
                {scan?.error && (
                  <p className="text-[10px] text-rose-500 mb-2 flex items-center gap-1">
                    <i className="fas fa-circle-exclamation"></i> No se pudo escanear
                  </p>
                )}

                {/* Row 3: Actions */}
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-slate-400">
                    {new Date(item.addedAt).toLocaleDateString('es-ES')}
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => { onAnalyze(item.symbol); onClose(); }}
                      title="Analizar con IA"
                      className="w-7 h-7 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 rounded-lg flex items-center justify-center hover:bg-emerald-200 dark:hover:bg-emerald-800 transition-colors text-xs"
                    >
                      <i className="fas fa-chart-line"></i>
                    </button>
                    <button
                      onClick={() => { setAlertTicker(item.symbol); setAlertError(null); }}
                      title="Crear alerta técnica"
                      className="w-7 h-7 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded-lg flex items-center justify-center hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors text-xs"
                    >
                      <i className="fas fa-bell"></i>
                    </button>
                    <button
                      onClick={() => onRemove(item.id)}
                      title="Eliminar de watchlist"
                      className="w-7 h-7 bg-slate-100 dark:bg-slate-900 text-slate-400 rounded-lg flex items-center justify-center hover:bg-rose-100 dark:hover:bg-rose-900/40 hover:text-rose-500 transition-colors text-xs"
                    >
                      <i className="fas fa-trash-alt"></i>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80">
          <p className="text-[10px] text-slate-400 text-center">
            <i className="fas fa-info-circle mr-1"></i>
            Pulsa <span className="font-bold text-amber-500">⭐</span> en cualquier análisis para añadir aquí
          </p>
        </div>
      </div>
    </div>
  );
};

export default WatchlistSidebar;
