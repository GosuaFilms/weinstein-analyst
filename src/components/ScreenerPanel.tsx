import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Language } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScreenerItem {
  symbol: string;
  name: string;
  currency: string;
  currentPrice: number;
  stage: 'STAGE_1' | 'STAGE_2' | 'STAGE_3' | 'STAGE_4';
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
  sma30: number | null;
  distanceFromSMA30Pct: number | null;
  sma30Trend: string | null;
  mansfieldRS: number | null;
  mansfieldRSTrend: string | null;
  volumeRatio: number | null;
  extendedStage2: boolean;
  benchmarkStage: string | null;
  suggestedStopLoss: number | null;
  stopLossRiskPct: number | null;
}

interface ScreenerResult {
  index: string;
  label: string;
  scannedAt: string;
  duration: number;
  total: number;
  failed?: string[];
  results: ScreenerItem[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INDICES = [
  { id: 'IBEX35',      label: 'IBEX 35',       flag: '🇪🇸', count: 35  },
  { id: 'SP100',       label: 'S&P 100',       flag: '🇺🇸', count: 50  },
  { id: 'SP500',       label: 'S&P 500',       flag: '🇺🇸', count: 160 },
  { id: 'NASDAQ50',    label: 'NASDAQ 50',     flag: '🇺🇸', count: 50  },
  { id: 'DAX40',       label: 'DAX 40',        flag: '🇩🇪', count: 40  },
  { id: 'CAC40',       label: 'CAC 40',        flag: '🇫🇷', count: 40  },
  { id: 'FTSE100',     label: 'FTSE 100',      flag: '🇬🇧', count: 80  },
  { id: 'EUROSTOXX50', label: 'Euro Stoxx 50', flag: '🇪🇺', count: 50  },
];

const STAGE_CONFIG = {
  STAGE_2: {
    label: 'Stage 2',
    sublabel: 'Alcista',
    color: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    border: 'border-emerald-200 dark:border-emerald-500/30',
    badge: 'bg-emerald-500 text-white',
    icon: 'fa-arrow-trend-up',
    order: 0,
  },
  STAGE_1: {
    label: 'Stage 1',
    sublabel: 'Acumulación',
    color: 'bg-blue-500',
    text: 'text-blue-700 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    border: 'border-blue-200 dark:border-blue-500/30',
    badge: 'bg-blue-500 text-white',
    icon: 'fa-pause',
    order: 1,
  },
  STAGE_3: {
    label: 'Stage 3',
    sublabel: 'Distribución',
    color: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    border: 'border-amber-200 dark:border-amber-500/30',
    badge: 'bg-amber-500 text-white',
    icon: 'fa-triangle-exclamation',
    order: 2,
  },
  STAGE_4: {
    label: 'Stage 4',
    sublabel: 'Bajista',
    color: 'bg-rose-500',
    text: 'text-rose-700 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-500/10',
    border: 'border-rose-200 dark:border-rose-500/30',
    badge: 'bg-rose-500 text-white',
    icon: 'fa-arrow-trend-down',
    order: 3,
  },
};

const CONF_DOTS: Record<string, string> = {
  high:   'bg-emerald-500',
  medium: 'bg-amber-500',
  low:    'bg-slate-400',
};

type StageFilter = 'ALL' | 'STAGE_1' | 'STAGE_2' | 'STAGE_3' | 'STAGE_4';

interface Props {
  language: Language;
  onAnalyze: (symbol: string) => void;
  onClose: () => void;
  isPro?: boolean;
  onUpgrade?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const ScreenerPanel: React.FC<Props> = ({ language, onAnalyze, onClose, isPro = false, onUpgrade }) => {
  const [selectedIndex, setSelectedIndex] = useState('IBEX35');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScreenerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<StageFilter>('ALL');
  const [expandedReason, setExpandedReason] = useState<string | null>(null);

  const exportCSV = () => {
    if (!result) return;
    const rows = filtered.length > 0 ? filtered : result.results;

    const headers = [
      'Símbolo', 'Nombre', 'Moneda', 'Precio', 'Etapa', 'Confianza',
      'SMA30', 'Dist.SMA30%', 'Tendencia SMA30',
      'RS Mansfield', 'Tendencia RS',
      'Ratio Volumen', 'Stage2 Extendido',
      'Stop Sugerido', 'Riesgo Stop%',
      'Razonamiento',
    ];

    const escape = (v: string | number | boolean | null | undefined): string => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const lines = rows.map(r => [
      r.symbol,
      r.name,
      r.currency,
      r.currentPrice,
      r.stage,
      r.confidence,
      r.sma30 ?? '',
      r.distanceFromSMA30Pct ?? '',
      r.sma30Trend ?? '',
      r.mansfieldRS ?? '',
      r.mansfieldRSTrend ?? '',
      r.volumeRatio ?? '',
      r.extendedStage2 ? 'Sí' : 'No',
      r.suggestedStopLoss ?? '',
      r.stopLossRiskPct ?? '',
      r.reasoning,
    ].map(escape).join(','));

    const bom = '﻿'; // UTF-8 BOM for Excel
    const csv = bom + [headers.join(','), ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `screener_${result.index}_${result.scannedAt.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runScan = async () => {
    setScanning(true);
    setError(null);
    setResult(null);
    setStageFilter('ALL');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('screener', {
        body: { index: selectedIndex, smaPeriod: 30 },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      setResult(data as ScreenerResult);
    } catch (e) {
      setError((e as Error).message || 'Error al ejecutar el screener.');
    } finally {
      setScanning(false);
    }
  };

  const filtered = result
    ? (stageFilter === 'ALL' ? result.results : result.results.filter(r => r.stage === stageFilter))
    : [];

  const stageCounts = result
    ? {
        STAGE_2: result.results.filter(r => r.stage === 'STAGE_2').length,
        STAGE_1: result.results.filter(r => r.stage === 'STAGE_1').length,
        STAGE_3: result.results.filter(r => r.stage === 'STAGE_3').length,
        STAGE_4: result.results.filter(r => r.stage === 'STAGE_4').length,
      }
    : null;

  const es = language === Language.ES;

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-6xl mx-4 my-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col">

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
              <i className="fas fa-satellite-dish text-emerald-500 text-lg"></i>
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                {es ? 'Screener de Etapas' : 'Stage Screener'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {es ? 'Escanea índices completos con el método Weinstein' : 'Scan full indices with the Weinstein method'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors p-2">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        {/* Controls */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
          <div className="flex flex-wrap items-center gap-3">
            {/* Index selector */}
            <div className="flex bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1 gap-1 flex-wrap">
              {INDICES.map(idx => (
                <button
                  key={idx.id}
                  onClick={() => { setSelectedIndex(idx.id); setResult(null); setError(null); }}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    selectedIndex === idx.id
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {idx.flag} {idx.label}
                  <span className="ml-1.5 text-[10px] opacity-70">{idx.count}</span>
                </button>
              ))}
            </div>

            {/* Scan button */}
            <button
              onClick={runScan}
              disabled={scanning}
              className="ml-auto px-8 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-black rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
            >
              {scanning ? (
                <><i className="fas fa-circle-notch animate-spin"></i>{es ? 'ESCANEANDO…' : 'SCANNING…'}</>
              ) : (
                <><i className="fas fa-radar"></i>{es ? 'ESCANEAR' : 'SCAN'}</>
              )}
            </button>
          </div>
        </div>

        {/* Scanning progress */}
        {scanning && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 border-4 border-emerald-500/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-4 flex items-center justify-center">
                <i className="fas fa-radar text-emerald-500 text-xl animate-pulse"></i>
              </div>
            </div>
            <div className="text-center">
              <p className="font-black text-slate-900 dark:text-white text-lg uppercase tracking-tighter">
                {es ? 'Escaneando mercado…' : 'Scanning market…'}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {es
                  ? `Analizando todos los valores del ${INDICES.find(i => i.id === selectedIndex)?.label}…`
                  : `Analyzing all ${INDICES.find(i => i.id === selectedIndex)?.label} stocks…`}
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !scanning && (
          <div className="m-6 p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-3 text-rose-700 dark:text-rose-400">
            <i className="fas fa-circle-exclamation text-xl flex-shrink-0"></i>
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!scanning && !result && !error && (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-50">
            <i className="fas fa-radar text-5xl mb-4 text-slate-300 dark:text-slate-600"></i>
            <p className="text-slate-500 dark:text-slate-400 font-medium">
              {es ? 'Selecciona un índice y pulsa ESCANEAR' : 'Select an index and press SCAN'}
            </p>
          </div>
        )}

        {/* Results */}
        {result && !scanning && (
          <>
            {/* Summary bar */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <i className="fas fa-clock"></i>
                <span>{es ? 'Escaneado en' : 'Scanned in'} <strong className="text-slate-700 dark:text-slate-300">{result.duration}s</strong></span>
                <span>·</span>
                <strong className="text-slate-700 dark:text-slate-300">{result.total}</strong> {es ? 'valores' : 'stocks'}
                {result.failed && result.failed.length > 0 && (
                  <span className="text-rose-500 text-xs">· {result.failed.length} {es ? 'con error' : 'failed'}</span>
                )}
              </div>

              {/* Export CSV */}
              <button
                onClick={exportCSV}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all shadow-sm"
                title={es ? 'Exportar a Excel/CSV' : 'Export to Excel/CSV'}
              >
                <i className="fas fa-file-csv text-emerald-500"></i>
                {es ? 'Exportar CSV' : 'Export CSV'}
              </button>

              {/* Stage filter pills */}
              <div className="ml-auto flex flex-wrap gap-1.5">
                <button
                  onClick={() => setStageFilter('ALL')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${stageFilter === 'ALL' ? 'bg-slate-800 dark:bg-white text-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}
                >
                  {es ? 'Todos' : 'All'} ({result.total})
                </button>
                {stageCounts && (['STAGE_2', 'STAGE_1', 'STAGE_3', 'STAGE_4'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setStageFilter(s)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${stageFilter === s ? STAGE_CONFIG[s].badge : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}
                  >
                    {STAGE_CONFIG[s].label} ({stageCounts[s]})
                  </button>
                ))}
              </div>
            </div>

            {/* Stage 2 highlight banner */}
            {stageCounts && stageCounts.STAGE_2 > 0 && (stageFilter === 'ALL' || stageFilter === 'STAGE_2') && (
              <div className="mx-6 mt-4 px-4 py-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl flex items-center gap-3">
                <i className="fas fa-fire text-emerald-500 text-lg"></i>
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                  {stageCounts.STAGE_2 === 1
                    ? (es ? '1 valor en Stage 2 — señal de compra potencial' : '1 stock in Stage 2 — potential buy signal')
                    : (es ? `${stageCounts.STAGE_2} valores en Stage 2 — señales de compra potenciales` : `${stageCounts.STAGE_2} stocks in Stage 2 — potential buy signals`)}
                </p>
              </div>
            )}

            {/* Grid */}
            <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <i className="fas fa-filter text-3xl mb-3 opacity-40"></i>
                  <p>{es ? 'Ningún valor en esta etapa.' : 'No stocks in this stage.'}</p>
                </div>
              ) : (
                <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(isPro ? filtered : filtered.slice(0, 5)).map(item => {
                    const sc = STAGE_CONFIG[item.stage];
                    const isExpanded = expandedReason === item.symbol;
                    const distPct = item.distanceFromSMA30Pct;
                    const distPos = distPct !== null && distPct > 0;
                    const distColor = distPct === null ? '' : distPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';

                    return (
                      <div
                        key={item.symbol}
                        className={`group relative p-4 rounded-xl border transition-all hover:shadow-md cursor-pointer ${sc.bg} ${sc.border}`}
                      >
                        {/* Stage badge */}
                        <div className="flex items-start justify-between mb-3">
                          <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${sc.badge}`}>
                            <i className={`fas ${sc.icon} text-[9px]`}></i>
                            {sc.label}
                            {item.extendedStage2 && (
                              <span className="ml-1 bg-white/30 px-1 rounded text-[8px]">EXT</span>
                            )}
                          </div>
                          {/* Confidence dots */}
                          <div className="flex items-center gap-1">
                            {(['high', 'medium', 'low'] as const).map((lvl, i) => (
                              <div
                                key={lvl}
                                className={`w-2 h-2 rounded-full transition-opacity ${
                                  (item.confidence === 'high') ||
                                  (item.confidence === 'medium' && i >= 1) ||
                                  (item.confidence === 'low' && i >= 2)
                                    ? CONF_DOTS[item.confidence]
                                    : 'bg-slate-200 dark:bg-slate-700'
                                }`}
                              />
                            ))}
                          </div>
                        </div>

                        {/* Ticker + name */}
                        <div className="mb-3">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-black text-slate-900 dark:text-white">{item.symbol}</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.currency}</span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate" title={item.name}>{item.name}</p>
                        </div>

                        {/* Price + metrics */}
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mb-3">
                          <div>
                            <span className="text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wider">Precio</span>
                            <p className="font-bold text-slate-800 dark:text-slate-200">
                              {item.currentPrice > 0 ? item.currentPrice.toFixed(2) : '—'}
                            </p>
                          </div>
                          {item.sma30 !== null && (
                            <div>
                              <span className="text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wider">SMA30</span>
                              <p className="font-bold text-slate-800 dark:text-slate-200">{item.sma30.toFixed(2)}</p>
                            </div>
                          )}
                          {distPct !== null && (
                            <div>
                              <span className="text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wider">Dist. SMA30</span>
                              <p className={`font-bold ${distColor}`}>
                                {distPos ? '+' : ''}{distPct.toFixed(1)}%
                              </p>
                            </div>
                          )}
                          {item.mansfieldRS !== null && (
                            <div>
                              <span className="text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wider">RS Mansfield</span>
                              <p className={`font-bold ${item.mansfieldRS >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {item.mansfieldRS.toFixed(2)}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Stop loss */}
                        {item.suggestedStopLoss !== null && (
                          <div className="mb-3 px-2 py-1.5 bg-white/60 dark:bg-slate-900/40 rounded-lg flex items-center justify-between text-xs">
                            <span className="text-slate-500 flex items-center gap-1">
                              <i className="fas fa-shield text-rose-400 text-[10px]"></i>
                              Stop
                            </span>
                            <span className="font-bold text-rose-600 dark:text-rose-400">
                              {item.suggestedStopLoss.toFixed(2)}
                              {item.stopLossRiskPct !== null && (
                                <span className="ml-1 text-[10px] opacity-70">({item.stopLossRiskPct.toFixed(1)}%)</span>
                              )}
                            </span>
                          </div>
                        )}

                        {/* Reasoning toggle */}
                        <button
                          onClick={(e) => { e.stopPropagation(); setExpandedReason(isExpanded ? null : item.symbol); }}
                          className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1 mb-2 transition-colors"
                        >
                          <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} text-[8px]`}></i>
                          {es ? 'Razonamiento' : 'Reasoning'}
                        </button>
                        {isExpanded && (
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 bg-white/60 dark:bg-slate-900/40 rounded-lg p-2 leading-relaxed mb-3">
                            {item.reasoning}
                          </p>
                        )}

                        {/* Analyze button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); onAnalyze(item.symbol); onClose(); }}
                          className="w-full py-2 bg-slate-800 dark:bg-white text-white dark:text-slate-900 font-bold rounded-lg text-xs hover:bg-slate-700 dark:hover:bg-slate-100 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <i className="fas fa-chart-simple"></i>
                          {es ? 'Analizar en detalle' : 'Analyze in detail'}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Free plan paywall banner */}
                {!isPro && filtered.length > 5 && (
                  <div className="relative mt-4 rounded-2xl overflow-hidden border border-amber-500/30">
                    {/* Blurred preview of hidden cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 pointer-events-none select-none blur-sm opacity-40">
                      {filtered.slice(5, 8).map(item => (
                        <div key={item.symbol} className={`p-4 rounded-xl border ${STAGE_CONFIG[item.stage].bg} ${STAGE_CONFIG[item.stage].border}`}>
                          <div className="h-3 bg-slate-300 dark:bg-slate-600 rounded w-16 mb-2" />
                          <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-20 mb-1" />
                          <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-24" />
                        </div>
                      ))}
                    </div>
                    {/* Upgrade overlay */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-transparent via-white/80 dark:via-slate-900/80 to-white dark:to-slate-900 p-6 text-center">
                      <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center mb-3">
                        <i className="fas fa-lock text-amber-500 text-xl"></i>
                      </div>
                      <p className="font-black text-slate-900 dark:text-white text-base mb-1">
                        {filtered.length - 5} {es ? 'resultados más ocultos' : 'more results hidden'}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 max-w-xs">
                        {es
                          ? 'El plan gratuito muestra los primeros 5 resultados. Actualiza a Pro para ver el screener completo.'
                          : 'The free plan shows the first 5 results. Upgrade to Pro to see the full screener.'}
                      </p>
                      <button
                        onClick={onUpgrade}
                        className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 text-sm"
                      >
                        <i className="fas fa-crown"></i>
                        {es ? 'Ver todos los resultados — Pro' : 'See all results — Pro'}
                      </button>
                    </div>
                  </div>
                )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ScreenerPanel;
