import React, { useState, useEffect } from 'react';
import { Language } from '../types';
import { usePortfolio, PortfolioPosition, PriceData } from '../hooks/usePortfolio';

interface Props {
  language: Language;
  onAnalyze: (symbol: string) => void;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtCurrency(n: number, currency: string): string {
  try {
    return n.toLocaleString('es-ES', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return `${fmt(n)} ${currency}`;
  }
}

function pnlColor(v: number) {
  if (v > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (v < 0) return 'text-rose-600 dark:text-rose-400';
  return 'text-slate-500';
}

function pnlBg(v: number) {
  if (v > 0) return 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30';
  if (v < 0) return 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30';
  return 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
}

// ─── Add Position Form ────────────────────────────────────────────────────────

interface AddFormProps {
  onAdd: (p: {
    symbol: string; name: string; currency: string;
    entryPrice: number; shares: number; entryDate: string;
    stopLoss: number | null; notes: string;
  }) => Promise<void>;
  onCancel: () => void;
  es: boolean;
}

const AddPositionForm: React.FC<AddFormProps> = ({ onAdd, onCancel, es }) => {
  const [symbol, setSymbol] = useState('');
  const [shares, setShares] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [stopLoss, setStopLoss] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol.trim() || !entryPrice || !shares) return;
    const ep = parseFloat(entryPrice);
    const sh = parseFloat(shares);
    if (isNaN(ep) || ep <= 0 || isNaN(sh) || sh <= 0) {
      setError(es ? 'Precio y acciones deben ser números positivos.' : 'Price and shares must be positive numbers.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onAdd({
        symbol: symbol.trim().toUpperCase(),
        name: '',
        currency: 'USD',
        entryPrice: ep,
        shares: sh,
        entryDate,
        stopLoss: stopLoss ? parseFloat(stopLoss) : null,
        notes,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
      <h3 className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-widest">
        <i className="fas fa-plus-circle text-emerald-500 mr-2"></i>
        {es ? 'Nueva Posición' : 'New Position'}
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            {es ? 'Símbolo' : 'Symbol'} *
          </label>
          <input
            type="text"
            placeholder="AAPL, SAN.MC…"
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-bold uppercase focus:ring-2 focus:ring-emerald-500/50 outline-none"
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            {es ? 'Acciones' : 'Shares'} *
          </label>
          <input
            type="number" step="any" min="0.000001" placeholder="100"
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none"
            value={shares}
            onChange={e => setShares(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            {es ? 'Precio Entrada' : 'Entry Price'} *
          </label>
          <input
            type="number" step="any" min="0.000001" placeholder="150.00"
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none"
            value={entryPrice}
            onChange={e => setEntryPrice(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            {es ? 'Fecha Entrada' : 'Entry Date'}
          </label>
          <input
            type="date"
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none"
            value={entryDate}
            onChange={e => setEntryDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Stop Loss
          </label>
          <input
            type="number" step="any" min="0" placeholder={es ? 'Opcional' : 'Optional'}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-rose-400/50 outline-none"
            value={stopLoss}
            onChange={e => setStopLoss(e.target.value)}
          />
        </div>
        <div className="col-span-2 sm:col-span-3">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            {es ? 'Notas' : 'Notes'}
          </label>
          <input
            type="text" placeholder={es ? 'Breakout Stage 2, setup Weinstein…' : 'Stage 2 breakout, Weinstein setup…'}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-5 py-2 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">
          {es ? 'Cancelar' : 'Cancel'}
        </button>
        <button type="submit" disabled={submitting} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-black rounded-xl text-sm transition-all flex items-center gap-2">
          {submitting ? <i className="fas fa-circle-notch animate-spin"></i> : <i className="fas fa-plus"></i>}
          {es ? 'Añadir Posición' : 'Add Position'}
        </button>
      </div>
    </form>
  );
};

// ─── Position Card ────────────────────────────────────────────────────────────

interface CardProps {
  pos: PortfolioPosition;
  priceData: PriceData | undefined;
  es: boolean;
  onAnalyze: () => void;
  onRemove: () => void;
  onUpdateStop: (stop: number | null) => void;
}

const PositionCard: React.FC<CardProps> = ({ pos, priceData, es, onAnalyze, onRemove, onUpdateStop }) => {
  const [editingStop, setEditingStop] = useState(false);
  const [stopInput, setStopInput] = useState(pos.stopLoss?.toString() ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const currentPrice = priceData?.price ?? null;
  const cost = pos.entryPrice * pos.shares;
  const currentValue = currentPrice !== null ? currentPrice * pos.shares : null;
  const pnlAbs = currentValue !== null ? currentValue - cost : null;
  const pnlPct = pnlAbs !== null ? (pnlAbs / cost) * 100 : null;
  const distToStop = pos.stopLoss && currentPrice ? ((currentPrice - pos.stopLoss) / currentPrice) * 100 : null;
  const atRisk = cost * (distToStop !== null ? Math.abs(distToStop) / 100 : 0);

  const saveStop = () => {
    const v = stopInput.trim() ? parseFloat(stopInput) : null;
    onUpdateStop(v && !isNaN(v) ? v : null);
    setEditingStop(false);
  };

  return (
    <div className={`relative p-5 rounded-2xl border transition-all ${pnlPct !== null ? pnlBg(pnlPct) : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>

      {/* Header row */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-black text-slate-900 dark:text-white">{pos.symbol}</span>
            {priceData?.currency && (
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{priceData.currency}</span>
            )}
          </div>
          {(priceData?.name && priceData.name !== pos.symbol) && (
            <p className="text-xs text-slate-500 truncate max-w-[180px]" title={priceData.name}>{priceData.name}</p>
          )}
          <p className="text-[10px] text-slate-400 mt-0.5">{es ? 'Entrada' : 'Entry'}: {pos.entryDate}</p>
        </div>

        {/* P&L badge */}
        {pnlPct !== null && (
          <div className={`text-right ${pnlColor(pnlPct)}`}>
            <p className="text-lg font-black leading-none">
              {pnlPct > 0 ? '+' : ''}{fmt(pnlPct)}%
            </p>
            {pnlAbs !== null && (
              <p className="text-xs font-bold opacity-80">
                {pnlAbs > 0 ? '+' : ''}{fmtCurrency(pnlAbs, priceData?.currency ?? pos.currency)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">{es ? 'Precio entrada' : 'Entry price'}</p>
          <p className="font-bold text-slate-800 dark:text-slate-200">{fmt(pos.entryPrice)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">{es ? 'Precio actual' : 'Current price'}</p>
          <p className="font-bold text-slate-800 dark:text-slate-200">
            {currentPrice !== null ? fmt(currentPrice) : <span className="text-slate-400">—</span>}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">{es ? 'Acciones' : 'Shares'}</p>
          <p className="font-bold text-slate-800 dark:text-slate-200">{fmt(pos.shares, pos.shares % 1 === 0 ? 0 : 3)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">{es ? 'Coste total' : 'Total cost'}</p>
          <p className="font-bold text-slate-800 dark:text-slate-200">{fmtCurrency(cost, priceData?.currency ?? pos.currency)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">{es ? 'Valor actual' : 'Current value'}</p>
          <p className={`font-bold ${currentValue !== null ? pnlColor(pnlPct ?? 0) : 'text-slate-400'}`}>
            {currentValue !== null ? fmtCurrency(currentValue, priceData?.currency ?? pos.currency) : '—'}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">{es ? 'En riesgo' : 'At risk'}</p>
          <p className="font-bold text-rose-600 dark:text-rose-400">
            {distToStop !== null ? fmtCurrency(atRisk, priceData?.currency ?? pos.currency) : '—'}
          </p>
        </div>
      </div>

      {/* Stop loss row */}
      <div className="flex items-center gap-2 mb-4 p-2 bg-white/60 dark:bg-slate-900/40 rounded-xl border border-slate-200/60 dark:border-slate-700/40">
        <i className="fas fa-shield text-rose-400 text-sm flex-shrink-0"></i>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Stop Loss</span>
        {editingStop ? (
          <>
            <input
              type="number" step="any" min="0"
              autoFocus
              className="flex-grow bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-700 rounded-lg px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-rose-400 w-24"
              value={stopInput}
              onChange={e => setStopInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveStop(); if (e.key === 'Escape') setEditingStop(false); }}
            />
            <button onClick={saveStop} className="text-xs px-2 py-1 bg-rose-500 text-white rounded-lg font-bold">✓</button>
            <button onClick={() => setEditingStop(false)} className="text-xs px-2 py-1 bg-slate-200 dark:bg-slate-700 rounded-lg">✕</button>
          </>
        ) : (
          <>
            <span className={`flex-grow text-sm font-bold ${pos.stopLoss ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
              {pos.stopLoss ? fmt(pos.stopLoss) : (es ? 'No definido' : 'Not set')}
            </span>
            {distToStop !== null && (
              <span className={`text-[10px] font-bold ${distToStop >= 0 ? 'text-slate-500' : 'text-rose-600 dark:text-rose-400 animate-pulse'}`}>
                {distToStop >= 0 ? `-${fmt(distToStop)}%` : `⚠ ${fmt(Math.abs(distToStop))}% bajo stop`}
              </span>
            )}
            <button
              onClick={() => { setStopInput(pos.stopLoss?.toString() ?? ''); setEditingStop(true); }}
              className="text-[10px] px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-500 hover:text-rose-500 rounded-lg transition-all font-bold"
            >
              <i className="fas fa-pen text-[9px]"></i>
            </button>
          </>
        )}
      </div>

      {/* Notes */}
      {pos.notes && (
        <p className="text-[10px] text-slate-500 italic mb-3 bg-white/40 dark:bg-slate-900/20 rounded px-2 py-1 truncate" title={pos.notes}>
          "{pos.notes}"
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onAnalyze}
          className="flex-grow py-2 bg-slate-800 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl text-xs hover:bg-slate-700 dark:hover:bg-slate-100 transition-all flex items-center justify-center gap-1.5"
        >
          <i className="fas fa-chart-simple"></i>
          {es ? 'Analizar' : 'Analyze'}
        </button>
        {confirmDelete ? (
          <>
            <button onClick={onRemove} className="px-3 py-2 bg-rose-500 text-white font-bold rounded-xl text-xs hover:bg-rose-400 transition-all">
              {es ? 'Confirmar' : 'Confirm'}
            </button>
            <button onClick={() => setConfirmDelete(false)} className="px-3 py-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl text-xs hover:bg-slate-300 dark:hover:bg-slate-600 transition-all">
              {es ? 'No' : 'No'}
            </button>
          </>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl text-xs transition-all">
            <i className="fas fa-trash-alt"></i>
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Main Panel ───────────────────────────────────────────────────────────────

const PortfolioPanel: React.FC<Props> = ({ language, onAnalyze, onClose }) => {
  const { positions, prices, loading, refreshing, refreshPrices, add, update, remove } = usePortfolio();
  const [showAddForm, setShowAddForm] = useState(false);
  const es = language === Language.ES;

  // Auto-fetch prices when positions load
  useEffect(() => {
    if (positions.length > 0) refreshPrices(positions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions.length]);

  // Summary metrics
  const totalCost = positions.reduce((sum, p) => sum + p.entryPrice * p.shares, 0);
  const totalValue = positions.reduce((sum, p) => {
    const price = prices[p.symbol]?.price;
    return price !== null && price !== undefined ? sum + price * p.shares : sum;
  }, 0);
  const totalPnL = totalValue - totalCost;
  const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;
  const hasPrices = positions.some(p => prices[p.symbol]?.price != null);

  const handleAdd = async (pos: Parameters<typeof add>[0]) => {
    const newPos = await add(pos);
    setShowAddForm(false);
    // Fetch price for the new position
    refreshPrices([newPos]);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-6xl mx-4 my-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col">

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
              <i className="fas fa-briefcase text-blue-500 text-lg"></i>
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                {es ? 'Portfolio' : 'Portfolio'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {es ? 'Posiciones abiertas · P&L en tiempo real' : 'Open positions · Real-time P&L'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refreshPrices()}
              disabled={refreshing || positions.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-500 disabled:opacity-50 transition-all"
            >
              <i className={`fas fa-rotate-right ${refreshing ? 'animate-spin' : ''}`}></i>
              {es ? 'Actualizar' : 'Refresh'}
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors p-2">
              <i className="fas fa-times text-xl"></i>
            </button>
          </div>
        </div>

        {/* Summary cards */}
        {positions.length > 0 && hasPrices && (
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{es ? 'Posiciones' : 'Positions'}</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{positions.length}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{es ? 'Invertido' : 'Invested'}</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{fmt(totalCost)}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{es ? 'Valor actual' : 'Current value'}</p>
              <p className={`text-2xl font-black ${pnlColor(totalPnL)}`}>{fmt(totalValue)}</p>
            </div>
            <div className={`rounded-xl p-4 border ${pnlBg(totalPnL)}`}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">P&L Total</p>
              <p className={`text-2xl font-black ${pnlColor(totalPnL)}`}>
                {totalPnL >= 0 ? '+' : ''}{fmt(totalPnLPct)}%
              </p>
              <p className={`text-xs font-bold ${pnlColor(totalPnL)}`}>
                {totalPnL >= 0 ? '+' : ''}{fmt(totalPnL)}
              </p>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>

          {/* Add button */}
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full mb-6 py-3 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold text-slate-400 hover:border-emerald-400 hover:text-emerald-500 dark:hover:border-emerald-600 dark:hover:text-emerald-400 transition-all flex items-center justify-center gap-2"
            >
              <i className="fas fa-plus-circle"></i>
              {es ? 'Añadir posición' : 'Add position'}
            </button>
          )}

          {/* Add form */}
          {showAddForm && (
            <div className="mb-6">
              <AddPositionForm onAdd={handleAdd} onCancel={() => setShowAddForm(false)} es={es} />
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-16">
              <i className="fas fa-circle-notch animate-spin text-3xl text-blue-500"></i>
            </div>
          )}

          {/* Empty state */}
          {!loading && positions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center opacity-50">
              <i className="fas fa-briefcase text-5xl mb-4 text-slate-300 dark:text-slate-600"></i>
              <p className="font-bold text-slate-500">{es ? 'Sin posiciones abiertas' : 'No open positions'}</p>
              <p className="text-sm text-slate-400 mt-1">{es ? 'Añade tu primera posición arriba' : 'Add your first position above'}</p>
            </div>
          )}

          {/* Positions grid */}
          {!loading && positions.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {positions.map(pos => (
                <PositionCard
                  key={pos.id}
                  pos={pos}
                  priceData={prices[pos.symbol]}
                  es={es}
                  onAnalyze={() => { onAnalyze(pos.symbol); onClose(); }}
                  onRemove={() => remove(pos.id)}
                  onUpdateStop={(stop) => update(pos.id, { stopLoss: stop ?? undefined })}
                />
              ))}
            </div>
          )}

          {/* Refresh tip */}
          {!loading && positions.length > 0 && (
            <p className="text-center text-[10px] text-slate-400 mt-6">
              <i className="fas fa-info-circle mr-1"></i>
              {es
                ? 'Los precios son orientativos. Pulsa "Actualizar" para refrescar.'
                : 'Prices are indicative. Press "Refresh" to update.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PortfolioPanel;
