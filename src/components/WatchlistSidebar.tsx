import React, { useState } from 'react';
import type { WatchlistItem } from '../hooks/useWatchlist';
import { AlertCondition, ALERT_CONDITION_LABELS } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  watchlist: WatchlistItem[];
  loading: boolean;
  onAnalyze: (symbol: string) => void;
  onAddAlert: (ticker: string, condition: AlertCondition) => Promise<void> | void;
  onRemove: (id: string) => void;
}

const WatchlistSidebar: React.FC<Props> = ({
  isOpen, onClose, watchlist, loading, onAnalyze, onAddAlert, onRemove,
}) => {
  const [alertTicker, setAlertTicker] = useState<string | null>(null);
  const [alertCondition, setAlertCondition] = useState<AlertCondition>(AlertCondition.PRICE_CROSS_SMA30_UP);
  const [alertSubmitting, setAlertSubmitting] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);

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

  return (
    <div className="fixed inset-0 z-[120] flex justify-end">
      <div
        className="absolute inset-0 bg-slate-950/20 dark:bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <i className="fas fa-star text-amber-400"></i> Watchlist
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {watchlist.length} activo{watchlist.length !== 1 ? 's' : ''} vigilado{watchlist.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
          >
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        {/* Alert mini-form (shown when user clicks the bell on an item) */}
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
            {alertError && (
              <p className="text-xs text-rose-600 mb-2">{alertError}</p>
            )}
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
          {loading && (
            <div className="flex justify-center pt-8">
              <i className="fas fa-circle-notch animate-spin text-slate-400 text-2xl"></i>
            </div>
          )}

          {!loading && watchlist.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
              <i className="fas fa-star text-4xl mb-4"></i>
              <p className="text-sm font-semibold">Tu watchlist está vacía</p>
              <p className="text-xs mt-1">Analiza un activo y pulsa ⭐ para añadirlo aquí.</p>
            </div>
          )}

          {!loading && watchlist.map(item => (
            <div
              key={item.id}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-emerald-400 dark:hover:border-emerald-600 transition-all group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded">
                      {item.symbol}
                    </span>
                  </div>
                  {item.name && (
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mt-1 truncate">
                      {item.name}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Añadido {new Date(item.addedAt).toLocaleDateString('es-ES')}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => { onAnalyze(item.symbol); onClose(); }}
                    title="Analizar ahora"
                    className="w-7 h-7 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 rounded-lg flex items-center justify-center hover:bg-emerald-200 dark:hover:bg-emerald-800 transition-colors text-xs"
                  >
                    <i className="fas fa-chart-line"></i>
                  </button>
                  <button
                    onClick={() => { setAlertTicker(item.symbol); setAlertError(null); }}
                    title="Crear alerta"
                    className="w-7 h-7 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded-lg flex items-center justify-center hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors text-xs"
                  >
                    <i className="fas fa-bell"></i>
                  </button>
                  <button
                    onClick={() => onRemove(item.id)}
                    title="Eliminar"
                    className="w-7 h-7 bg-slate-100 dark:bg-slate-900 text-slate-400 rounded-lg flex items-center justify-center hover:bg-rose-100 dark:hover:bg-rose-900/40 hover:text-rose-500 transition-colors text-xs"
                  >
                    <i className="fas fa-trash-alt"></i>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80">
          <p className="text-[10px] text-slate-400 text-center">
            <i className="fas fa-info-circle mr-1"></i>
            Pulsa <span className="font-bold text-emerald-500">⭐</span> en cualquier análisis para añadirlo aquí
          </p>
        </div>
      </div>
    </div>
  );
};

export default WatchlistSidebar;
