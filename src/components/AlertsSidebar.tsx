
import React, { useState } from 'react';
import { Alert, AlertCondition, ALERT_CONDITION_LABELS } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  alerts: Alert[];
  onAddAlert: (ticker: string, condition: AlertCondition) => Promise<void> | void;
  onDeleteAlert: (id: string) => Promise<void> | void;
  onCheckAll: () => void;
  isChecking: boolean;
}

const AlertsSidebar: React.FC<Props> = ({ isOpen, onClose, alerts, onAddAlert, onDeleteAlert, onCheckAll, isChecking }) => {
  const [newTicker, setNewTicker] = useState('');
  const [newCondition, setNewCondition] = useState<AlertCondition>(AlertCondition.PRICE_CROSS_SMA30_UP);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicker.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await onAddAlert(newTicker.toUpperCase(), newCondition);
      setNewTicker('');
    } catch (err) {
      setError((err as Error).message || 'No se pudo crear la alerta.');
    } finally {
      setSubmitting(false);
    }
  };

  const getConditionColor = (condition: AlertCondition) => {
    switch (condition) {
      case AlertCondition.RESISTANCE_BREAKOUT:
      case AlertCondition.PRICE_CROSS_SMA30_UP:
        return 'text-emerald-600 dark:text-emerald-400';
      case AlertCondition.SUPPORT_BREAKDOWN:
      case AlertCondition.PRICE_CROSS_SMA30_DOWN:
        return 'text-rose-600 dark:text-rose-400';
      case AlertCondition.VOLUME_SURGE:
        return 'text-amber-600 dark:text-amber-400';
      default:
        return 'text-slate-600 dark:text-slate-400';
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex justify-end">
      <div className="absolute inset-0 bg-slate-950/20 dark:bg-slate-950/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300 transition-colors">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <i className="fas fa-bell text-amber-500"></i> Alertas Técnicas
            </h3>
            <p className="text-xs text-slate-500 mt-1">Configura disparadores para tus activos</p>
            <div className="flex items-center gap-1 mt-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Auto-check: 5m</span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              placeholder="Símbolo o Empresa (ej. Tesla)"
              className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none"
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value)}
            />
            <select
              className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm outline-none"
              value={newCondition}
              onChange={(e) => setNewCondition(e.target.value as AlertCondition)}
            >
              {Object.values(AlertCondition).map((cond) => (
                <option key={cond} value={cond}>{ALERT_CONDITION_LABELS[cond]}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold rounded-lg text-sm transition-all shadow-md disabled:opacity-50"
            >
              {submitting ? 'Añadiendo…' : 'Añadir Alerta'}
            </button>
            {error && (
              <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded px-2 py-1">
                {error}
              </p>
            )}
          </form>
        </div>

        <div className="flex-grow overflow-y-auto p-4 space-y-3">
          {alerts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
              <i className="fas fa-bell-slash text-4xl mb-4"></i>
              <p className="text-sm">No tienes alertas configuradas.</p>
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className={`relative p-4 rounded-xl border transition-all ${
                  alert.status === 'triggered'
                    ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/50'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{alert.ticker}</span>
                    <h4 className={`text-sm font-bold mt-0.5 ${getConditionColor(alert.condition)}`}>
                      {ALERT_CONDITION_LABELS[alert.condition] ?? alert.condition}
                    </h4>
                    {alert.triggerMessage && (
                      <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-2 bg-amber-100 dark:bg-amber-900/30 p-2 rounded border border-amber-200 dark:border-amber-700/50">
                        {alert.triggerMessage}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => onDeleteAlert(alert.id)}
                    className="text-slate-400 hover:text-rose-500 transition-colors p-1"
                  >
                    <i className="fas fa-trash-alt text-xs"></i>
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${
                      alert.status === 'triggered' ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-slate-900 text-slate-500'
                    }`}>
                      {alert.status === 'active' ? 'Activa' : 'Disparada'}
                    </span>
                    {alert.triggeredAt && (
                      <span className="text-[9px] font-medium text-amber-600 dark:text-amber-400">
                        {new Date(alert.triggeredAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] text-slate-400">
                    {alert.lastChecked ? `Checked: ${new Date(alert.lastChecked).toLocaleTimeString()}` : 'Nunca comprobado'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80">
          <button
            onClick={onCheckAll}
            disabled={isChecking || alerts.filter(a => a.status === 'active').length === 0}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale"
          >
            {isChecking ? (
              <><i className="fas fa-circle-notch animate-spin"></i> ESCANEANDO...</>
            ) : (
              <><i className="fas fa-radar"></i> ESCANEAR ALERTAS ACTIVAS</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlertsSidebar;
