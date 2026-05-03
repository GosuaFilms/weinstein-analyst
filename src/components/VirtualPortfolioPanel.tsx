import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Language } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VirtualPosition {
  symbol: string;
  name: string;
  nativeCurrency: string;
  currentPrice: number;
  confidence: 'low' | 'medium' | 'high';
  mansfieldRS: number | null;
  stopLoss: number | null;
  stopLossRiskPct: number | null;
  distanceFromSMA30Pct: number | null;
  extendedStage2: boolean;
  region: string;
  allocationPct: number;
  allocationAmount: number;
  approxShares: number;
  positionRisk: number;
  positionRiskPct: number;
}

interface VirtualPortfolioResult {
  portfolioCurrency: string;
  portfolioAmount: number;
  scannedAt: string;
  duration: number;
  indicesScanned: string[];
  totalStage2Found: number;
  totalAllocated: number;
  totalAllocatedPct: number;
  cashReserve: number;
  cashReservePct: number;
  maxPortfolioRisk: number;
  maxPortfolioRiskPct: number;
  positions: VirtualPosition[];
  methodology: {
    riskPerPosition: string;
    maxPositions: number;
    maxPerRegion: number;
    cashReserveTarget: string;
    stopLossMethod: string;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REGION_LABELS: Record<string, string> = {
  US: '🇺🇸 USA', ES: '🇪🇸 España', DE: '🇩🇪 Alemania',
  UK: '🇬🇧 Reino Unido', EU: '🇪🇺 Europa', APAC: '🌏 Asia-Pac',
};

const CONF_CONFIG = {
  high:   { label: 'Alta',  badge: 'bg-emerald-500 text-white' },
  medium: { label: 'Media', badge: 'bg-amber-500 text-white' },
  low:    { label: 'Baja',  badge: 'bg-slate-400 text-white' },
};

const PALETTE = [
  '#10b981','#3b82f6','#f59e0b','#8b5cf6','#f43f5e',
  '#06b6d4','#84cc16','#f97316','#ec4899','#6366f1',
  '#14b8a6','#a855f7',
];

const INDEX_OPTIONS = [
  { id: 'IBEX35',   label: 'IBEX 35',    flag: '🇪🇸' },
  { id: 'DAX40',    label: 'DAX 40',     flag: '🇩🇪' },
  { id: 'SP100',    label: 'S&P 100',    flag: '🇺🇸' },
  { id: 'NASDAQ50', label: 'NASDAQ 50',  flag: '🇺🇸' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, d = 2) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtMoney(n: number, currency: string) {
  try {
    return n.toLocaleString('es-ES', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 });
  } catch {
    return `${fmt(n, 0)} ${currency}`;
  }
}

function r2(v: number | null | undefined): string {
  if (v === null || v === undefined) return '';
  return (Math.round(v * 100) / 100).toFixed(2);
}

function exportCSV(result: VirtualPortfolioResult) {
  const headers = [
    'Símbolo','Nombre','Moneda nativa','Precio actual',
    'Asignación %','Importe asignado','Acciones aprox.',
    'Stop Loss','Riesgo stop %','Riesgo posición (abs)','Riesgo posición (% cartera)',
    'RS Mansfield','Dist. SMA30 %','Confianza','Región',
    'Stage2 Extendido',
  ];
  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(v);
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = result.positions.map(p => [
    p.symbol,
    p.name,
    p.nativeCurrency,
    r2(p.currentPrice),
    p.allocationPct.toFixed(1),
    p.allocationAmount.toFixed(2),
    // Integer shares for normal stocks
    p.approxShares,
    r2(p.stopLoss),
    r2(p.stopLossRiskPct),
    r2(p.positionRisk),
    p.positionRiskPct.toFixed(2),
    r2(p.mansfieldRS),
    r2(p.distanceFromSMA30Pct),
    p.confidence,
    p.region,
    p.extendedStage2 ? 'Sí' : 'No',
  ].map(esc).join(','));

  const meta = [
    `# Cartera Virtual Weinstein — ${result.portfolioCurrency} ${fmtMoney(result.portfolioAmount, result.portfolioCurrency)}`,
    `# Generada: ${new Date(result.scannedAt).toLocaleString('es-ES')}`,
    `# Índices: ${result.indicesScanned.join(', ')}`,
    `# Total invertido: ${result.totalAllocatedPct}% · Liquidez: ${result.cashReservePct}% · Riesgo máx: ${result.maxPortfolioRiskPct}%`,
    `# ⚠️  NO ES UNA RECOMENDACIÓN DE INVERSIÓN. Carácter exclusivamente educativo.`,
    '',
  ];

  const bom = '﻿';
  const csv = bom + [...meta, headers.join(','), ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cartera_weinstein_${result.portfolioCurrency}_${result.scannedAt.slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Disclaimer Component ──────────────────────────────────────────────────────

const Disclaimer: React.FC<{ es: boolean; compact?: boolean }> = ({ es, compact }) => (
  <div className={`bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/40 rounded-xl ${compact ? 'p-3' : 'p-5'}`}>
    <div className="flex gap-3 items-start">
      <i className="fas fa-triangle-exclamation text-amber-500 text-lg flex-shrink-0 mt-0.5"></i>
      <div>
        <p className={`font-black text-amber-800 dark:text-amber-400 ${compact ? 'text-xs' : 'text-sm'} uppercase tracking-wide mb-1`}>
          {es ? '⚠️ No es una recomendación de inversión' : '⚠️ Not investment advice'}
        </p>
        <p className={`text-amber-700 dark:text-amber-300 ${compact ? 'text-[10px]' : 'text-xs'} leading-relaxed`}>
          {es
            ? 'Esta cartera es un ejemplo educativo basado en el método de Stan Weinstein. No constituye asesoramiento financiero ni recomendación de compra o venta. Los mercados financieros conllevan riesgos significativos y puedes perder parte o todo tu capital. Consulta siempre con un asesor financiero cualificado antes de tomar decisiones de inversión.'
            : 'This portfolio is an educational example based on Stan Weinstein\'s method. It does not constitute financial advice or a buy/sell recommendation. Financial markets involve significant risks and you may lose part or all of your capital. Always consult a qualified financial advisor before making investment decisions.'}
        </p>
        {!compact && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2 font-bold">
            {es
              ? 'La cartera es dinámica y cambiará cuando los valores cambien de etapa Weinstein.'
              : 'The portfolio is dynamic and will change as stocks change Weinstein stage.'}
          </p>
        )}
      </div>
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  language: Language;
  onAnalyze: (symbol: string) => void;
  onClose: () => void;
}

const VirtualPortfolioPanel: React.FC<Props> = ({ language, onAnalyze, onClose }) => {
  const es = language === Language.ES;

  const [currency, setCurrency] = useState<'EUR' | 'USD'>('EUR');
  const [amount, setAmount] = useState(100000);
  const [amountInput, setAmountInput] = useState('100000');
  const [selectedIndices, setSelectedIndices] = useState<string[]>(['IBEX35', 'DAX40', 'SP100']);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<VirtualPortfolioResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedPos, setExpandedPos] = useState<string | null>(null);

  // Sync currency ↔ default indices
  const handleCurrencyChange = (c: 'EUR' | 'USD') => {
    setCurrency(c);
    setSelectedIndices(c === 'EUR' ? ['IBEX35', 'DAX40', 'SP100'] : ['SP100', 'NASDAQ50', 'IBEX35']);
    setResult(null);
  };

  const toggleIndex = (id: string) => {
    setSelectedIndices(prev =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter(x => x !== id) : prev) : [...prev, id]
    );
  };

  const generate = async () => {
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('virtual-portfolio', {
        body: { currency, amount, indices: selectedIndices },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      setResult(data as VirtualPortfolioResult);
    } catch (e) {
      setError((e as Error).message || 'Error al generar la cartera.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-6xl mx-4 my-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col">

        {/* ── Header ── */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-500/10 rounded-xl flex items-center justify-center">
              <i className="fas fa-chart-pie text-violet-500 text-lg"></i>
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                {es ? 'Cartera Virtual Weinstein' : 'Weinstein Virtual Portfolio'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {es
                  ? 'Cartera diversificada generada automáticamente con el método Weinstein'
                  : 'Auto-generated diversified portfolio using the Weinstein method'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors p-2">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        {/* ── Controls ── */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-4">
          {/* Disclaimer */}
          <Disclaimer es={es} />

          <div className="flex flex-wrap items-end gap-4">
            {/* Currency */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                {es ? 'Divisa de cartera' : 'Portfolio currency'}
              </label>
              <div className="flex bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1 gap-1">
                {(['EUR', 'USD'] as const).map(c => (
                  <button
                    key={c}
                    onClick={() => handleCurrencyChange(c)}
                    className={`px-5 py-2 rounded-lg text-sm font-black transition-all ${currency === c ? 'bg-violet-500 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                  >
                    {c === 'EUR' ? '€ EUR' : '$ USD'}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                {es ? 'Capital de referencia' : 'Reference capital'}
              </label>
              <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <span className="px-3 text-slate-400 font-bold text-sm border-r border-slate-200 dark:border-slate-700">
                  {currency === 'EUR' ? '€' : '$'}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="px-3 py-2.5 text-sm font-bold text-slate-900 dark:text-white bg-transparent w-32 outline-none"
                  value={amountInput}
                  onChange={e => {
                    setAmountInput(e.target.value);
                    const n = parseInt(e.target.value.replace(/\D/g, ''));
                    if (!isNaN(n) && n >= 1000) setAmount(n);
                  }}
                />
              </div>
            </div>

            {/* Index selector */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                {es ? 'Índices a escanear' : 'Indices to scan'}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {INDEX_OPTIONS.map(idx => (
                  <button
                    key={idx.id}
                    onClick={() => toggleIndex(idx.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                      selectedIndices.includes(idx.id)
                        ? 'bg-violet-500 text-white border-violet-400'
                        : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-violet-300'
                    }`}
                  >
                    {idx.flag} {idx.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate */}
            <button
              onClick={generate}
              disabled={generating}
              className="ml-auto px-8 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-black rounded-xl transition-all shadow-lg shadow-violet-500/20 flex items-center gap-2"
            >
              {generating ? (
                <><i className="fas fa-circle-notch animate-spin"></i>{es ? 'GENERANDO…' : 'GENERATING…'}</>
              ) : (
                <><i className="fas fa-wand-magic-sparkles"></i>{es ? 'GENERAR CARTERA' : 'GENERATE PORTFOLIO'}</>
              )}
            </button>
          </div>
        </div>

        {/* ── Generating state ── */}
        {generating && (
          <div className="flex flex-col items-center justify-center py-20 gap-5">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 border-4 border-violet-500/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-4 flex items-center justify-center">
                <i className="fas fa-chart-pie text-violet-500 text-xl animate-pulse"></i>
              </div>
            </div>
            <div className="text-center">
              <p className="font-black text-slate-900 dark:text-white text-lg uppercase tracking-tighter">
                {es ? 'Construyendo cartera…' : 'Building portfolio…'}
              </p>
              <p className="text-sm text-slate-500 mt-1 max-w-xs">
                {es
                  ? `Escaneando ${selectedIndices.join(', ')} en busca de Stage 2…`
                  : `Scanning ${selectedIndices.join(', ')} for Stage 2 stocks…`}
              </p>
              <p className="text-xs text-slate-400 mt-2 italic">
                {es ? '(puede tardar 30–60 segundos)' : '(may take 30–60 seconds)'}
              </p>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {error && !generating && (
          <div className="m-6 p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-3 text-rose-700 dark:text-rose-400">
            <i className="fas fa-circle-exclamation text-xl flex-shrink-0"></i>
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* ── Empty state ── */}
        {!generating && !result && !error && (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-50">
            <i className="fas fa-chart-pie text-5xl mb-4 text-slate-300 dark:text-slate-600"></i>
            <p className="text-slate-500 dark:text-slate-400 font-medium text-sm max-w-xs">
              {es
                ? 'Configura tu divisa y capital, luego pulsa "Generar Cartera"'
                : 'Set your currency and capital, then press "Generate Portfolio"'}
            </p>
          </div>
        )}

        {/* ── Results ── */}
        {result && !generating && (
          <div className="p-6 overflow-y-auto space-y-6" style={{ maxHeight: 'calc(100vh - 340px)' }}>

            {/* Summary strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{es ? 'Posiciones' : 'Positions'}</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white">{result.positions.length}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {es ? `de ${result.totalStage2Found} en Stage 2` : `of ${result.totalStage2Found} in Stage 2`}
                </p>
              </div>
              <div className="bg-violet-50 dark:bg-violet-500/10 rounded-xl p-4 border border-violet-200 dark:border-violet-500/30">
                <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-1">{es ? 'Invertido' : 'Invested'}</p>
                <p className="text-2xl font-black text-violet-700 dark:text-violet-400">{result.totalAllocatedPct}%</p>
                <p className="text-[10px] text-violet-600 dark:text-violet-400 mt-0.5">{fmtMoney(result.totalAllocated, result.portfolioCurrency)}</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-500/10 rounded-xl p-4 border border-blue-200 dark:border-blue-500/30">
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">{es ? 'Liquidez' : 'Cash'}</p>
                <p className="text-2xl font-black text-blue-700 dark:text-blue-400">{result.cashReservePct}%</p>
                <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">{fmtMoney(result.cashReserve, result.portfolioCurrency)}</p>
              </div>
              <div className="bg-rose-50 dark:bg-rose-500/10 rounded-xl p-4 border border-rose-200 dark:border-rose-500/30">
                <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider mb-1">{es ? 'Riesgo máx.' : 'Max risk'}</p>
                <p className="text-2xl font-black text-rose-700 dark:text-rose-400">{result.maxPortfolioRiskPct}%</p>
                <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5">{fmtMoney(result.maxPortfolioRisk, result.portfolioCurrency)}</p>
              </div>
            </div>

            {/* Allocation bar */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                {es ? 'Distribución del Capital' : 'Capital Distribution'}
              </p>
              <div className="h-8 rounded-xl overflow-hidden flex bg-slate-100 dark:bg-slate-800">
                {result.positions.map((p, i) => (
                  <div
                    key={p.symbol}
                    style={{ width: `${p.allocationPct}%`, backgroundColor: PALETTE[i % PALETTE.length] }}
                    className="h-full flex items-center justify-center overflow-hidden transition-all hover:opacity-80 cursor-default"
                    title={`${p.symbol}: ${p.allocationPct}%`}
                  >
                    {p.allocationPct > 5 && (
                      <span className="text-[9px] font-black text-white truncate px-1">{p.symbol}</span>
                    )}
                  </div>
                ))}
                {/* Cash */}
                <div
                  style={{ width: `${result.cashReservePct}%` }}
                  className="h-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center"
                  title={`Cash: ${result.cashReservePct}%`}
                >
                  {result.cashReservePct > 5 && (
                    <span className="text-[9px] font-black text-slate-500 dark:text-slate-300">CASH</span>
                  )}
                </div>
              </div>
              {/* Legend */}
              <div className="flex flex-wrap gap-2 mt-2">
                {result.positions.map((p, i) => (
                  <div key={p.symbol} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">{p.symbol} {p.allocationPct}%</span>
                  </div>
                ))}
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-500 flex-shrink-0" />
                  <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">Cash {result.cashReservePct}%</span>
                </div>
              </div>
            </div>

            {/* No results */}
            {result.positions.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <i className="fas fa-search text-3xl mb-3 opacity-40"></i>
                <p className="font-medium">{es ? 'No se encontraron suficientes valores en Stage 2.' : 'No enough Stage 2 stocks found.'}</p>
                <p className="text-sm mt-1">{es ? 'Prueba añadiendo más índices.' : 'Try adding more indices.'}</p>
              </div>
            )}

            {/* Position cards */}
            {result.positions.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {result.positions.map((p, i) => {
                  const isExp = expandedPos === p.symbol;
                  return (
                    <div
                      key={p.symbol}
                      className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden hover:shadow-md transition-shadow"
                    >
                      {/* Colour accent bar */}
                      <div className="h-1.5 w-full" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />

                      <div className="p-4">
                        {/* Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-slate-900 dark:text-white">{p.symbol}</span>
                              <span className="text-[10px] font-bold text-slate-400 uppercase">{p.nativeCurrency}</span>
                              {p.extendedStage2 && (
                                <span className="text-[9px] bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 font-bold px-1.5 py-0.5 rounded">EXT</span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 truncate max-w-[170px] mt-0.5" title={p.name}>{p.name}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{REGION_LABELS[p.region] ?? p.region}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-black text-violet-600 dark:text-violet-400">{p.allocationPct}%</p>
                            <p className="text-xs font-bold text-slate-500">{fmtMoney(p.allocationAmount, result.portfolioCurrency)}</p>
                          </div>
                        </div>

                        {/* Metrics */}
                        <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider">{es ? 'Precio' : 'Price'}</p>
                            <p className="font-bold text-slate-800 dark:text-slate-200">{fmt(p.currentPrice)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider">{es ? 'Acciones' : 'Shares'}</p>
                            <p className="font-bold text-slate-800 dark:text-slate-200">~{fmt(p.approxShares, p.approxShares < 1 ? 3 : 0)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider">RS</p>
                            <p className={`font-bold ${p.mansfieldRS !== null ? (p.mansfieldRS >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400') : 'text-slate-400'}`}>
                              {p.mansfieldRS !== null ? fmt(p.mansfieldRS) : '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Stop</p>
                            <p className="font-bold text-rose-600 dark:text-rose-400">{p.stopLoss ? fmt(p.stopLoss) : '—'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider">{es ? 'Dist. stop' : 'Stop dist.'}</p>
                            <p className="font-bold text-slate-700 dark:text-slate-300">{p.stopLossRiskPct ? `-${fmt(p.stopLossRiskPct)}%` : '—'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider">{es ? 'Riesgo' : 'Risk'}</p>
                            <p className="font-bold text-rose-600 dark:text-rose-400">-{fmt(p.positionRiskPct)}%</p>
                          </div>
                        </div>

                        {/* Confidence badge */}
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${CONF_CONFIG[p.confidence].badge}`}>
                            {es ? 'Confianza' : 'Confidence'}: {CONF_CONFIG[p.confidence].label}
                          </span>
                          {p.distanceFromSMA30Pct !== null && (
                            <span className="text-[9px] text-slate-500">
                              SMA30: {p.distanceFromSMA30Pct > 0 ? '+' : ''}{fmt(p.distanceFromSMA30Pct)}%
                            </span>
                          )}
                        </div>

                        {/* Risk bar within position */}
                        <div className="mb-3">
                          <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-rose-400 dark:bg-rose-500 rounded-full"
                              style={{ width: `${Math.min(p.positionRiskPct * 5, 100)}%` }}
                            />
                          </div>
                          <p className="text-[9px] text-slate-400 mt-0.5">
                            {es ? 'Riesgo máx. posición' : 'Max position risk'}: {fmtMoney(p.positionRisk, result.portfolioCurrency)} (-{fmt(p.positionRiskPct)}% {es ? 'cartera' : 'portfolio'})
                          </p>
                        </div>

                        {/* Analyze button */}
                        <button
                          onClick={() => { onAnalyze(p.symbol); onClose(); }}
                          className="w-full py-2 bg-slate-800 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl text-xs hover:bg-slate-700 dark:hover:bg-slate-100 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <i className="fas fa-chart-simple"></i>
                          {es ? 'Análisis Weinstein completo' : 'Full Weinstein analysis'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Methodology */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
              <button
                onClick={() => setExpandedPos(expandedPos === '__methodology__' ? null : '__methodology__')}
                className="w-full flex items-center justify-between text-sm font-bold text-slate-700 dark:text-slate-300"
              >
                <span><i className="fas fa-book-open text-violet-500 mr-2"></i>{es ? 'Metodología aplicada' : 'Applied methodology'}</span>
                <i className={`fas fa-chevron-${expandedPos === '__methodology__' ? 'up' : 'down'} text-slate-400 text-xs`}></i>
              </button>
              {expandedPos === '__methodology__' && (
                <div className="mt-4 space-y-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="font-black text-slate-700 dark:text-slate-300 mb-2">
                        {es ? 'Selección de valores' : 'Stock selection'}
                      </p>
                      <ul className="space-y-1.5">
                        <li><i className="fas fa-check text-emerald-500 mr-2"></i>{es ? 'Solo Stage 2 (tendencia alcista confirmada)' : 'Stage 2 only (confirmed uptrend)'}</li>
                        <li><i className="fas fa-check text-emerald-500 mr-2"></i>{es ? 'Confianza media o alta en la clasificación' : 'Medium or high confidence classification'}</li>
                        <li><i className="fas fa-check text-emerald-500 mr-2"></i>{es ? 'Puntuación: RS Mansfield, distancia SMA30, extensión' : 'Scored by: Mansfield RS, SMA30 distance, extension'}</li>
                        <li><i className="fas fa-check text-emerald-500 mr-2"></i>{es ? 'Máx. 4 valores por región geográfica' : 'Max 4 stocks per geographic region'}</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-black text-slate-700 dark:text-slate-300 mb-2">
                        {es ? 'Tamaño de posición' : 'Position sizing'}
                      </p>
                      <ul className="space-y-1.5">
                        <li><i className="fas fa-check text-violet-500 mr-2"></i>{es ? 'Riesgo objetivo: 1.5% del portfolio por posición' : 'Target risk: 1.5% of portfolio per position'}</li>
                        <li><i className="fas fa-check text-violet-500 mr-2"></i>{es ? 'Stop loss: SMA30 semanal o mínimo reciente' : 'Stop loss: weekly SMA30 or recent swing low'}</li>
                        <li><i className="fas fa-check text-violet-500 mr-2"></i>{es ? 'Máx. 12% por posición, mínimo 3%' : 'Max 12% per position, min 3%'}</li>
                        <li><i className="fas fa-check text-violet-500 mr-2"></i>{es ? '~15% en liquidez como reserva táctica' : '~15% in cash as tactical reserve'}</li>
                      </ul>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                    <p className="font-black text-slate-700 dark:text-slate-300 mb-1">
                      {es ? 'Sobre el método Weinstein' : 'About the Weinstein method'}
                    </p>
                    <p>
                      {es
                        ? 'Basado en "Secrets for Profiting in Bull and Bear Markets" de Stan Weinstein (1988). La estrategia consiste en comprar solo valores en Stage 2 (por encima de su SMA30 semanal con pendiente positiva), mantenerlos mientras continúen en Stage 2, y vender cuando entren en Stage 3 o rompan el stop. La fuerza relativa de Mansfield confirma que el valor supera a su índice de referencia.'
                        : 'Based on "Secrets for Profiting in Bull and Bear Markets" by Stan Weinstein (1988). The strategy consists of buying only Stage 2 stocks (above their weekly SMA30 with positive slope), holding while they remain in Stage 2, and selling when they enter Stage 3 or break their stop. Mansfield RS confirms the stock is outperforming its benchmark.'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                    {[
                      { k: es ? 'Índices escaneados' : 'Scanned indices', v: result.indicesScanned.join(', ') },
                      { k: es ? 'Stage 2 encontrados' : 'Stage 2 found', v: result.totalStage2Found },
                      { k: es ? 'Riesgo por posición' : 'Risk per position', v: result.methodology.riskPerPosition },
                      { k: es ? 'Stop loss' : 'Stop loss method', v: result.methodology.stopLossMethod },
                    ].map(item => (
                      <div key={item.k} className="bg-white dark:bg-slate-900 rounded-lg p-2 border border-slate-200 dark:border-slate-700">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">{item.k}</p>
                        <p className="font-bold text-slate-700 dark:text-slate-300 text-[11px] mt-0.5">{item.v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action bar */}
            <div className="flex flex-wrap gap-3 justify-between items-center">
              <div className="text-xs text-slate-400">
                <i className="fas fa-clock mr-1"></i>
                {es ? 'Generada en' : 'Generated in'} {result.duration}s · {new Date(result.scannedAt).toLocaleString('es-ES')}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={generate}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-violet-400 hover:text-violet-500 transition-all"
                >
                  <i className="fas fa-rotate-right"></i>
                  {es ? 'Regenerar' : 'Regenerate'}
                </button>
                <button
                  onClick={() => exportCSV(result)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-400 hover:text-emerald-600 transition-all"
                >
                  <i className="fas fa-file-csv text-emerald-500"></i>
                  {es ? 'Exportar CSV' : 'Export CSV'}
                </button>
              </div>
            </div>

            {/* Bottom disclaimer */}
            <Disclaimer es={es} compact />
          </div>
        )}
      </div>
    </div>
  );
};

export default VirtualPortfolioPanel;
